// Desk on fake data, until Role 1's API is up. Reads Role 3's fixtures (the same people and
// tasks the /agent page shows) and Role 4's data/seed.json. Events the agents post are kept in
// memory, printed to the server log, and shown back to the agent so it does not file twice.
// Every name, address and number here is made up.

import { pilot } from "@/lib/pilot";
import seed from "@/data/seed.json";
import { makeBoard } from "@/fixtures/board";
import { makeEvents, makeMessages, users as fixtureUsers } from "@/fixtures/desk";
import type { Event, InboxItem, Message, Shelter, User } from "@/lib/types";
import { composeContext, type Board, type DeskPort, type NewEvent, type UserContext } from "./port";

const DESK = pilot.id;

// Two people the fixtures do not have, so every role in §9 can be tried in chat.
const EXTRA_USERS: User[] = [
  {
    _id: "shelter-b-staff", name: "Elif (Shelter B)", role: "shelter", region: pilot.region, status: "available",
    deskId: DESK, trust: "official",
    profile: { notes: "Runs the mosque hall shelter. Sends photos of the whiteboard." },
  },
  {
    _id: "citizen-1", name: "Hasan", role: "public", region: pilot.region, status: "available",
    deskId: DESK, trust: "public",
    profile: { notes: "Family of six in a car park, one baby." },
  },
];

// Survives Next.js hot reloads in dev, so the conversation does not reset on every edit.
const g = globalThis as unknown as { __deskStore?: { events: Event[]; messages: Message[]; seq: number } };
const store = (g.__deskStore ??= { events: [], messages: [], seq: 0 });

function allUsers(): User[] {
  const seen = new Set<string>();
  const out: User[] = [];
  for (const u of [...fixtureUsers, ...EXTRA_USERS, ...(seed.users as unknown as User[])]) {
    if (!seen.has(u._id)) { seen.add(u._id); out.push(u); }
  }
  return out;
}

function board(now: number): Board {
  const b = makeBoard(now);
  // Seed times are in Feb 2023. Move them to "now", keeping their offsets, like the fixtures do.
  const raw = seed.shelters as unknown as Shelter[];
  const newest = Math.max(...raw.map((s) => +new Date(s.observedAt)));
  const shift = (t: Date | string) => new Date(now - (newest - +new Date(t)));
  const seedShelters = raw.map((s) => ({ ...s, updated: shift(s.updated), observedAt: shift(s.observedAt),
    history: (s.history ?? []).map((h) => ({ ...h, ts: shift(h.ts) })) }));
  return {
    sites: b.sites, needs: b.needs, roads: b.roads, incidents: b.incidents, tasks: b.tasks,
    shelters: [...b.shelters, ...seedShelters],
    zones: [],
  };
}

/** Fixture inbox: a task item per open task, an approval item per waiting task for coordinators. */
function inboxFor(user: User, b: Board, now: number): InboxItem[] {
  const items: InboxItem[] = b.tasks
    .filter((t) => t.open && t.assignee === user._id)
    .map((t) => ({ _id: `in-${t._id}`, userId: user._id, taskId: t._id, kind: "task" as const,
      message: t.title, status: "unread" as const, ts: new Date(now - 60000), priority: t.priority }));
  if (user.role === "coordinator") {
    for (const i of b.incidents.filter((i) => i.status !== "resolved" && i.severity === "critical")) {
      items.push({ _id: `ic-${i._id}`, userId: user._id, incidentId: i._id, kind: "incident",
        message: `Incident: ${i.textEn}`, status: "unread", ts: new Date(now - 60000), priority: 100 });
    }
    for (const t of b.tasks.filter((t) => t.status === "waiting_approval")) {
      items.push({ _id: `ap-${t._id}`, userId: user._id, taskId: t._id, kind: "approval",
        message: `Approve? ${t.title}`, status: "unread", ts: new Date(now - 60000), priority: t.priority });
    }
  }
  return items;
}

export const fixtureDesk: DeskPort = {
  name: "fixture",

  async getUser(id) { return allUsers().find((u) => u._id === id); },
  async listUsers() { return allUsers(); },

  async getBoard() { return board(Date.now()); },

  async getUserContext(userId): Promise<UserContext> {
    const user = allUsers().find((u) => u._id === userId);
    if (!user) throw new Error(`unknown user ${userId}`);
    const now = Date.now();
    const b = board(now);
    const seeded = store.messages.some((m) => m.userId === userId) ? [] : makeMessages(userId, now);
    return composeContext({
      user, board: b, inbox: inboxFor(user, b, now),
      messages: [...seeded, ...store.messages], posted: store.events, now: new Date(now),
    });
  },

  async recentEvents(_deskId, sinceMinutes) {
    const now = Date.now();
    const cutoff = now - sinceMinutes * 60000;
    return [...store.events, ...makeEvents(now)].filter((e) => +new Date(e.ts) >= cutoff)
      .sort((a, b) => +new Date(b.ts) - +new Date(a.ts));
  },

  async postEvent(e: NewEvent) {
    const id = `local-${++store.seq}`;
    const event: Event = {
      ...e, _id: id, ts: new Date(), observedAt: e.observedAt ? new Date(e.observedAt) : undefined,
      lane: e.source === "person" || e.source === "system" ? 0 : 1, status: "pending",
    };
    if (e.dedupeKey && store.events.some((x) => x.dedupeKey === e.dedupeKey)) {
      return store.events.find((x) => x.dedupeKey === e.dedupeKey)!._id!;
    }
    store.events.unshift(event);
    console.log(`[desk:fixture] event ${id}`, JSON.stringify({ type: e.type, actor: e.actor, payload: e.payload }));
    return id;
  },

  async saveMessage(m) {
    store.messages.push({ ...m, _id: `msg-${store.messages.length + 1}` });
  },
};
