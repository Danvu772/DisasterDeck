// Owned by Role 1. The collective memory: connection, indexes, and the four shared functions.
// See lib/README.md for setup and usage.
//
// Rules this file keeps (Team contracts §2):
// - postEvent() is the only way anything enters memory. Nothing here writes records:
//   the memory keeper does, later, inside the Brain loop.
// - Relative imports only, so the Node workers (run with tsx) can load this file too.
import { MongoClient, MongoServerError, ObjectId, type Db, type Document } from "mongodb";
import type {
  Board, Event, Health, InboxItem, Incident, Message, Need, NewEvent, RecordType, Road,
  SearchCollection, SearchHit, SearchQuery, Shelter, Site, Task, User, UserContext, Zone,
} from "./types";

// ---------- connection ----------

const DEFAULT_DB = "disaster_desk";
const DEFAULT_DESK = "malatya-2023";

export function deskId(): string {
  return process.env.DESK_ID || DEFAULT_DESK;
}

// Cached on globalThis so `next dev` hot reloads reuse one pool instead of opening a new one.
const g = globalThis as typeof globalThis & {
  __deskMongo?: { client: MongoClient; db: Promise<Db> };
};

/** The database, with indexes ensured on first use. */
export function getDb(): Promise<Db> {
  if (!g.__deskMongo) {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error(
        "MONGODB_URI is not set. Copy .env.example to .env.local (see lib/README.md).",
      );
    }
    const client = new MongoClient(uri, { appName: "disaster-desk" });
    const db = client
      .connect()
      .then(async (c) => {
        const d = c.db(process.env.MONGODB_DB || DEFAULT_DB);
        await ensureIndexes(d);
        return d;
      })
      .catch((err) => {
        g.__deskMongo = undefined; // let the next call retry
        throw err;
      });
    g.__deskMongo = { client, db };
  }
  return g.__deskMongo.db;
}

/** Close the pool. Only scripts need this; the app and the workers keep it open. */
export async function closeDb(): Promise<void> {
  const m = g.__deskMongo;
  g.__deskMongo = undefined;
  if (m) await m.client.close();
}

/** Typed collections. `const { events } = await cols();` */
export async function cols() {
  const db = await getDb();
  return {
    events: db.collection<Event>("events"),
    sites: db.collection<Site>("sites"),
    needs: db.collection<Need>("needs"),
    roads: db.collection<Road>("roads"),
    shelters: db.collection<Shelter>("shelters"),
    zones: db.collection<Zone>("zones"),
    incidents: db.collection<Incident>("incidents"),
    tasks: db.collection<Task>("tasks"),
    inbox: db.collection<InboxItem>("inbox"),
    users: db.collection<User>("users"),
    messages: db.collection<Message>("messages"),
    // "brain": the loop's heartbeat. "brain-lease": which Brain process may run (only one).
    // "version:<deskId>": a counter bumped after every record write (see bumpDeskVersion).
    meta: db.collection<{ _id: string; lastLoopAt?: Date; holder?: string; until?: Date; version?: number }>("meta"),
  };
}

/**
 * The four indexes from Team contracts §4, plus one for the memory keeper's copy check.
 * Safe to run again: createIndex is idempotent.
 */
export async function ensureIndexes(db: Db): Promise<void> {
  await Promise.all([
    // The keeper's take: pending, lane 0 first, oldest first.
    db.collection("events").createIndex({ status: 1, lane: 1, ts: 1 }, { name: "take" }),
    // The same post twice is ignored.
    db.collection("events").createIndex(
      { dedupeKey: 1 },
      { name: "dedupe", unique: true, sparse: true },
    ),
    // The dispatcher cannot create the same open task twice.
    db.collection("tasks").createIndex(
      { recordId: 1, type: 1 },
      { name: "one_open_task", unique: true, partialFilterExpression: { open: true } },
    ),
    // Inbox polling every second.
    db.collection("inbox").createIndex({ userId: 1, status: 1, ts: -1 }, { name: "inbox_poll" }),
    // Memory keeper: "was this exact text reported before?" (copies add a source, not support).
    db.collection("events").createIndex(
      { deskId: 1, "result.textKey": 1 },
      { name: "copies", partialFilterExpression: { "result.textKey": { $exists: true } } },
    ),
    // GET /api/events?since=: the feed, newest events of one desk.
    db.collection("events").createIndex({ deskId: 1, ts: 1 }, { name: "feed" }),
    // Personal agent, every message: what this person's agent already filed, and their chat lines.
    db.collection("events").createIndex({ actor: 1, ts: -1 }, { name: "by_actor" }),
    db.collection("messages").createIndex({ userId: 1, ts: -1 }, { name: "chat" }),
  ]);
}

/** Every _id in the contract is a string. ObjectId hex keeps them roughly time-ordered. */
export function newId(): string {
  return new ObjectId().toHexString();
}

// ---------- postEvent ----------

/**
 * Put a fact into memory. The only way anything enters memory.
 * - lane 0 for people on the desk and the sweeper (source "person" or "system"), lane 1 otherwise.
 * - If dedupeKey was posted before, nothing is inserted and the old id is returned.
 * - `actor` must come from the server (login session, or the worker's agent name), never a client body.
 */
export async function postEvent<P>(e: NewEvent<P>): Promise<string> {
  const { events } = await cols();
  const now = new Date();
  const doc: Event<P> = {
    _id: newId(),
    deskId: e.deskId || deskId(),
    ts: now,
    observedAt: e.observedAt ?? now,
    type: e.type,
    source: e.source,
    actor: e.actor,
    lane: e.source === "person" || e.source === "system" ? 0 : 1,
    payload: e.payload,
    status: "pending",
    attempts: 0,
    ...(e.dedupeKey ? { dedupeKey: e.dedupeKey } : {}),
  };
  try {
    await events.insertOne(doc as Event);
    return doc._id!;
  } catch (err) {
    // Relies on the unique index, so two racing inserts of one tweet still give one event.
    if (err instanceof MongoServerError && err.code === 11000 && e.dedupeKey) {
      const old = await events.findOne({ dedupeKey: e.dedupeKey }, { projection: { _id: 1 } });
      if (old?._id) return old._id;
    }
    throw err;
  }
}

// ---------- reads ----------

const byPriority = { tier: 1, priority: -1 } as const;

const COLLECTION_OF: Record<RecordType, SearchCollection> = {
  site: "sites", need: "needs", road: "roads",
  shelter: "shelters", zone: "zones", incident: "incidents",
};

/** What a personal agent loads every turn (Team contracts §4). */
export async function getUserContext(userId: string): Promise<UserContext> {
  const c = await cols();
  const [user, inbox, tasks, needs, incidents, recent] = await Promise.all([
    c.users.findOne({ _id: userId }),
    c.inbox.find({ userId, status: "unread" }).sort({ ts: -1 }).toArray(),
    c.tasks.find({ assignee: userId, open: true }).sort(byPriority).toArray(),
    c.needs
      .find({ requestedBy: userId, status: { $nin: ["delivered", "cancelled"] } })
      .sort(byPriority)
      .toArray(),
    c.incidents.find({ reportedBy: userId, status: { $ne: "resolved" } }).toArray(),
    c.messages.find({ userId }).sort({ ts: -1 }).limit(10).toArray(),
  ]);

  // The records those tasks touch, one query per collection.
  const idsByType = new Map<RecordType, string[]>();
  for (const t of tasks) {
    idsByType.set(t.recordType, [...(idsByType.get(t.recordType) ?? []), t.recordId]);
  }
  const db = await getDb();
  const records = (
    await Promise.all(
      [...idsByType].map(([type, ids]) =>
        db.collection<Document & { _id: string }>(COLLECTION_OF[type])
          .find({ _id: { $in: ids } })
          .toArray(),
      ),
    )
  ).flat() as unknown as UserContext["records"];

  return { user, inbox, tasks, records, needs, incidents, messages: recent.reverse() };
}

/** Queue health for GET /api/health and the line at the bottom of the board. */
export async function getHealth(): Promise<Health> {
  const c = await cols();
  const [pending, oldest, failed, meta] = await Promise.all([
    c.events.countDocuments({ status: "pending" }),
    c.events.findOne({ status: "pending" }, { sort: { ts: 1 }, projection: { ts: 1 } }),
    c.events.countDocuments({ status: "failed" }),
    c.meta.findOne({ _id: "brain" }),
  ]);
  return {
    pending,
    oldestPendingSeconds: oldest ? Math.round((Date.now() - oldest.ts.getTime()) / 1000) : 0,
    failed,
    lastLoopAt: meta?.lastLoopAt ?? null,
  };
}

/** The Brain loop calls this every turn so /api/health can tell a dead loop from a quiet one. */
export async function markLoop(): Promise<void> {
  const { meta } = await cols();
  await meta.updateOne({ _id: "brain" }, { $set: { lastLoopAt: new Date() } }, { upsert: true });
}

// ---------- desk version ----------

/**
 * A counter per desk, bumped after every record write. Readers (the personal agents) keep one
 * copy of the board per desk and reread it only when this number changes, so a thousand chat
 * messages cost one board read, and the copy is never older than the last write.
 * Whoever writes records calls bumpDeskVersion() after the write: the Brain does it per event.
 */
export async function bumpDeskVersion(desk: string = deskId()): Promise<void> {
  const { meta } = await cols();
  await meta.updateOne({ _id: `version:${desk}` }, { $inc: { version: 1 } }, { upsert: true });
}

export async function getDeskVersion(desk: string = deskId()): Promise<number> {
  const { meta } = await cols();
  const doc = await meta.findOne({ _id: `version:${desk}` }, { projection: { version: 1 } });
  return doc?.version ?? 0;
}

/** Everything the shared board shows, sorted by tier then priority. Same shape as fixtures/board.ts. */
export async function getBoard(desk: string = deskId()): Promise<Board> {
  const c = await cols();
  const q = { deskId: desk };
  const [sites, needs, roads, shelters, zones, incidents, tasks, health] = await Promise.all([
    c.sites.find(q).sort(byPriority).toArray(),
    c.needs.find(q).sort(byPriority).toArray(),
    c.roads.find(q).sort({ observedAt: -1 }).toArray(),
    c.shelters.find(q).sort({ name: 1 }).toArray(),
    c.zones.find(q).sort({ name: 1 }).toArray(),
    c.incidents.find(q).sort({ _id: -1 }).toArray(),
    c.tasks.find(q).sort(byPriority).toArray(),
    getHealth(),
  ]);
  return { sites, needs, roads, shelters, zones, incidents, tasks, health };
}

/** GET /api/inbox: one person's unread items, newest first. */
export async function getInbox(userId: string, limit = 100): Promise<InboxItem[]> {
  const { inbox } = await cols();
  return inbox.find({ userId, status: "unread" }).sort({ ts: -1 }).limit(limit).toArray();
}

/** What GET /api/users shows of a person. Never `profile`: it holds stock counts and notes. */
export type Person = Pick<User, "_id" | "name" | "role" | "region" | "status" | "coords" | "lastSeen">;

/** GET /api/users: the people on one desk, by name. */
export async function listUsers(desk: string = deskId()): Promise<Person[]> {
  const { users } = await cols();
  const people = await users
    .find({ deskId: desk }, { projection: { _id: 1, name: 1, role: 1, region: 1, status: 1, coords: 1, lastSeen: 1 } })
    .sort({ name: 1 })
    .toArray();
  // Rebuilt field by field, so a field added to User later does not leak out by default.
  return people.map(({ _id, name, role, region, status, coords, lastSeen }) =>
    ({ _id, name, role, region, status, ...(coords ? { coords } : {}), ...(lastSeen ? { lastSeen } : {}) }));
}

// Which fields `text` is matched against, per collection.
const TEXT_FIELDS: Record<SearchCollection, string[]> = {
  sites: ["address", "region"],
  needs: ["item", "region"],
  roads: ["road", "reason"],
  shelters: ["name", "region"],
  zones: ["name"],
  incidents: ["text", "textEn", "kind"],
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Read only. Behind the personal agents' ask_desk tool. Every hit says how old the fact is. */
export async function searchMemory(q: SearchQuery): Promise<SearchHit[]> {
  const db = await getDb();
  const filter: Document = { deskId: q.deskId || deskId() };
  if (q.region) filter.region = q.region;
  if (q.status) filter.status = q.status;
  if (q.text) {
    const re = { $regex: escapeRegex(q.text), $options: "i" };
    filter.$or = TEXT_FIELDS[q.collection].map((f) => ({ [f]: re }));
  }
  const docs = await db
    .collection(q.collection)
    .find(filter)
    .limit(Math.min(Math.max(q.limit ?? 20, 1), 100))
    .toArray();

  const now = Date.now();
  return docs.map((d) => {
    const lastHistory = Array.isArray(d.history) ? d.history.at(-1)?.ts : undefined;
    const when: Date | undefined = d.observedAt ?? d.updated ?? lastHistory;
    return {
      record: d as unknown as SearchHit["record"],
      ageSeconds: when instanceof Date ? Math.round((now - when.getTime()) / 1000) : null,
    };
  });
}
