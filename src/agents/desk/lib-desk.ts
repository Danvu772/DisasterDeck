// Desk on Role 1's collective memory: calls the functions in lib/db.ts directly, in the same
// process (Next.js server or a tsx worker). Turned on when MONGODB_URI is set.
//
// Why direct and not over HTTP: /api/chat already knows who is talking, so it can post events
// with that person as the actor, on the server, as Team contracts §4 wants. Workers post with
// their agent name. Nothing here writes records: postEvent() only queues an event.
//
// Users come from the `users` collection (npm run db:seed loads data/seed.json). The /agent page
// still shows Role 3's fixture people (zeynep, team-4, …); they are found in the fixtures as a
// fallback so the chat answers, but the real database has no tasks for them.

import { demoNow } from "../../lib/demo";
import { closeDb, cols, getBoard, getDeskVersion, newId, postEvent } from "../../lib/db";
import { eventBody } from "../../lib/schemas";
import type { Event, User } from "../../lib/types";
import { loadChat } from "./chat-memory";
import { fixtureDesk } from "./fixture-desk";
import { composeContext, type Board, type DeskPort, type NewEvent } from "./port";

// ---------- one board copy per desk ----------
// Every chat message needs the board (tasks, incidents, roads, shelters). Reading 8 collections
// per message does not scale, so each process keeps one copy per desk and rereads it only when
// the desk version changes (the Brain bumps it after every write; see lib/db.ts) or the copy is
// older than BOARD_MAX_AGE_MS, for a writer that forgets to bump. Requests that arrive while a
// read is running share that read. Cost per message: one findOne on `meta`.
const BOARD_MAX_AGE_MS = 20_000;
type BoardCopy = { version: number; at: number; board: Promise<Board> };
const g = globalThis as typeof globalThis & { __deskBoards?: Map<string, BoardCopy> };
const boards = (g.__deskBoards ??= new Map<string, BoardCopy>());

async function readBoard(deskId: string): Promise<Board> {
  const b = await getBoard(deskId);
  return { sites: b.sites, needs: b.needs, roads: b.roads, shelters: b.shelters, zones: b.zones,
    incidents: b.incidents, tasks: b.tasks } satisfies Board;
}

// The version itself is shared for VERSION_TTL_MS: under a burst, 50 messages ask the database
// once, not 50 times. A Brain write is seen at most this much later.
const VERSION_TTL_MS = 1_000;
const versions = new Map<string, { at: number; v: Promise<number> }>();
function deskVersion(deskId: string): Promise<number> {
  const hit = versions.get(deskId);
  if (hit && Date.now() - hit.at < VERSION_TTL_MS) return hit.v;
  const v = getDeskVersion(deskId);
  const entry = { at: Date.now(), v };
  versions.set(deskId, entry);
  v.catch(() => { if (versions.get(deskId) === entry) versions.delete(deskId); });
  return v;
}

export async function cachedBoard(deskId: string): Promise<Board> {
  const version = await deskVersion(deskId);
  const copy = boards.get(deskId);
  if (copy && copy.version >= version && Date.now() - copy.at < BOARD_MAX_AGE_MS) return copy.board;
  const fresh: BoardCopy = { version, at: Date.now(), board: readBoard(deskId) };
  boards.set(deskId, fresh);
  fresh.board.catch(() => { if (boards.get(deskId) === fresh) boards.delete(deskId); }); // retry next time
  return fresh.board;
}

// People change rarely (role, profile): keep each for USER_TTL_MS instead of a query per message.
const USER_TTL_MS = 30_000;
const people = new Map<string, { at: number; user: Promise<User | undefined> }>();
async function readUser(id: string): Promise<User | undefined> {
  const { users } = await cols();
  return (await users.findOne({ _id: id })) ?? (await fixtureDesk.getUser(id));
}
function findUser(id: string): Promise<User | undefined> {
  const hit = people.get(id);
  if (hit && Date.now() - hit.at < USER_TTL_MS) return hit.user;
  const entry = { at: Date.now(), user: readUser(id) };
  people.set(id, entry);
  entry.user.then((u) => { if (!u) people.delete(id); }, () => people.delete(id));
  return entry.user;
}

export const libDesk: DeskPort = {
  name: "mongodb",

  getUser: findUser,

  async listUsers() {
    const { users } = await cols();
    return users.find({}).toArray();
  },

  getBoard: cachedBoard,

  async getUserContext(userId) {
    const user = await findUser(userId);
    if (!user) throw new Error(`unknown user ${userId}`);
    const { events, inbox } = await cols();
    // All side by side: the board copy (usually no read), and small indexed queries.
    const [board, unread, chat, posted] = await Promise.all([
      cachedBoard(user.deskId),
      inbox.find({ userId, status: "unread" }).sort({ ts: -1 }).limit(50).toArray(),
      loadChat(userId),
      events.find({ actor: userId }).sort({ ts: -1 }).limit(10).toArray(),
    ]);
    const ctx = composeContext({ user, board, inbox: unread, messages: chat.lines, posted, now: await demoNow() }); // the demo clock (D-0017); real time with no demo run
    return { ...ctx, messages: chat.lines, chatSummary: chat.summary };
  },

  async recentEvents(deskId, sinceMinutes) {
    const { events } = await cols();
    const since = new Date(Date.now() - sinceMinutes * 60000);
    return events.find({ deskId, ts: { $gte: since } }).sort({ ts: -1 }).limit(200).toArray() as Promise<Event[]>;
  },

  async postEvent(e: NewEvent) {
    // The whole event, not only its payload, goes through the same schema as POST /api/events
    // (lib/schemas.ts eventBody, shown in Swagger at /api/docs): type, source, ids, dates, payload.
    // Model output is untrusted until it fits. `actor` is ours to set: this is server code.
    const parsed = eventBody.safeParse(e);
    if (!parsed.success) {
      throw new Error(`${e.type} event rejected by the schema: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
    }
    const b = parsed.data;
    return postEvent({
      // JSON round trip drops undefined fields, which the driver would store as null.
      type: b.type, source: b.source, actor: e.actor, payload: JSON.parse(JSON.stringify(b.payload)), deskId: b.deskId,
      observedAt: b.observedAt, dedupeKey: b.dedupeKey,
    });
  },

  // Team contracts §2: the chat API writes `messages`. /api/chat is that API.
  async saveMessage(m) {
    const { messages } = await cols();
    await messages.insertOne({ ...m, _id: newId() });
  },

  async close() {
    await closeDb();
  },
};
