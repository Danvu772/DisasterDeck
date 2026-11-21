// Desk over Role 1's HTTP API (Team contracts §4). Turned on by DESK_API_URL.
//   GET  /api/board            → Board
//   GET  /api/inbox?user=<id>  → InboxItem[]   (DEMO_MODE, or a session cookie we do not have)
//   POST /api/events           → { id }        with x-agent-key
//   GET  /api/events?since=    → Event[]       optional: asked of Role 1 in "Personal agents"
// Users come from GET /api/users if Role 1 adds it, else from data/seed.json and the fixtures.
// Chat messages stay in this process's memory until Role 1 stores them.

import type { Event, InboxItem, Message, User } from "@/lib/types";
import { fixtureDesk } from "./fixture-desk";
import { composeContext, type Board, type DeskPort, type NewEvent } from "./port";

const base = () => (process.env.DESK_API_URL ?? "").replace(/\/$/, "");
const headers = () => ({ "content-type": "application/json", "x-agent-key": process.env.AGENT_KEY ?? "" });

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${base()}${path}`, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return (await res.json()) as T;
}

const g = globalThis as unknown as { __httpDeskMessages?: Message[] };
const messages = (g.__httpDeskMessages ??= []);
const posted: Event[] = [];

async function users(): Promise<User[]> {
  try { return await getJson<User[]>("/api/users"); } catch { return fixtureDesk.listUsers(); }
}

export const httpDesk: DeskPort = {
  name: "http",

  async getUser(id) { return (await users()).find((u) => u._id === id); },
  listUsers: users,

  async getBoard() {
    const b = await getJson<Partial<Board>>("/api/board");
    return {
      sites: b.sites ?? [], needs: b.needs ?? [], roads: b.roads ?? [], shelters: b.shelters ?? [],
      zones: b.zones ?? [], incidents: b.incidents ?? [], tasks: b.tasks ?? [],
    };
  },

  async getUserContext(userId) {
    const user = await this.getUser(userId);
    if (!user) throw new Error(`unknown user ${userId}`);
    const [board, inbox] = await Promise.all([
      this.getBoard(user.deskId),
      getJson<InboxItem[]>(`/api/inbox?user=${encodeURIComponent(userId)}`).catch(() => []),
    ]);
    return composeContext({ user, board, inbox, messages, posted, now: new Date() });
  },

  async recentEvents(_deskId, sinceMinutes) {
    const since = new Date(Date.now() - sinceMinutes * 60000).toISOString();
    try { return await getJson<Event[]>(`/api/events?since=${encodeURIComponent(since)}`); } catch { return posted; }
  },

  async postEvent(e: NewEvent) {
    const res = await fetch(`${base()}/api/events`, { method: "POST", headers: headers(), body: JSON.stringify(e) });
    if (!res.ok) throw new Error(`POST /api/events → ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const { id } = (await res.json()) as { id: string };
    posted.unshift({ ...e, _id: id, ts: new Date(), lane: 0, status: "pending",
      observedAt: e.observedAt ? new Date(e.observedAt) : undefined });
    return id;
  },

  async saveMessage(m) {
    messages.push({ ...m, _id: `msg-${messages.length + 1}` });
  },
};
