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

import { closeDb, cols, getBoard, getUserContext, newId, postEvent } from "../../lib/db";
import { payloadSchemas } from "../../lib/schemas";
import type { Event, User } from "../../lib/types";
import { fixtureDesk } from "./fixture-desk";
import { composeContext, type Board, type DeskPort, type NewEvent } from "./port";

async function findUser(id: string): Promise<User | undefined> {
  const { users } = await cols();
  return (await users.findOne({ _id: id })) ?? (await fixtureDesk.getUser(id));
}

export const libDesk: DeskPort = {
  name: "mongodb",

  getUser: findUser,

  async listUsers() {
    const { users } = await cols();
    return users.find({}).toArray();
  },

  async getBoard(deskId) {
    const b = await getBoard(deskId);
    return { sites: b.sites, needs: b.needs, roads: b.roads, shelters: b.shelters, zones: b.zones,
      incidents: b.incidents, tasks: b.tasks } satisfies Board;
  },

  async getUserContext(userId) {
    const user = await findUser(userId);
    if (!user) throw new Error(`unknown user ${userId}`);
    const { events } = await cols();
    const [mine, board, posted] = await Promise.all([
      getUserContext(userId),            // Role 1: inbox, open tasks, their needs, last 10 messages
      this.getBoard(user.deskId),        // the rest of the desk: approvals, incidents, roads, shelters
      events.find({ actor: userId }).sort({ ts: -1 }).limit(10).toArray(),
    ]);
    return composeContext({ user, board, inbox: mine.inbox, messages: mine.messages, posted, now: new Date() });
  },

  async recentEvents(deskId, sinceMinutes) {
    const { events } = await cols();
    const since = new Date(Date.now() - sinceMinutes * 60000);
    return events.find({ deskId, ts: { $gte: since } }).sort({ ts: -1 }).limit(200).toArray() as Promise<Event[]>;
  },

  async postEvent(e: NewEvent) {
    // Same check POST /api/events runs: model output is untrusted until it fits the schema.
    const schema = payloadSchemas[e.type as keyof typeof payloadSchemas];
    const parsed = schema ? schema.safeParse(e.payload) : { success: true as const, data: e.payload };
    if (!parsed.success) {
      throw new Error(`${e.type} payload rejected: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
    }
    return postEvent({
      // JSON round trip drops undefined fields, which the driver would store as null.
      type: e.type, source: e.source, actor: e.actor, payload: JSON.parse(JSON.stringify(parsed.data)), deskId: e.deskId,
      observedAt: e.observedAt ? new Date(e.observedAt) : undefined, dedupeKey: e.dedupeKey,
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
