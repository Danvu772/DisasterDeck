// Pure helpers for the /agent desk feed: the server's events, the lines the buttons add, and the fixtures.
import type { Event } from "@/lib/types";

export type FeedEvent = Event & { _id: string };

const ms = (e: FeedEvent) => +new Date(e.ts);

// Add what a poll returned to what we hold. Same _id keeps one copy.
export function mergeServer(held: FeedEvent[] | null, got: FeedEvent[]): FeedEvent[] {
  const byId = new Map((held ?? []).map((e) => [e._id, e]));
  for (const e of got) byId.set(e._id, e);
  return [...byId.values()];
}

// The newest ts we hold, as epoch ms. GET /api/events?since= asks for events after it.
export function cursorOf(events: FeedEvent[] | null): number | null {
  return events && events.length ? Math.max(...events.map(ms)) : null;
}

export function feedUrl(cursor: number | null): string {
  return cursor === null ? "/api/events?limit=30" : `/api/events?since=${cursor}&limit=30`;
}

const detail = (e: FeedEvent) => {
  const p = e.payload as { taskId?: string; result?: string; kind?: string; approved?: boolean };
  return `${p.taskId}|${p.result ?? p.kind ?? p.approved}`;
};

// A button line is the server's now when the dedupeKey matches, or when a server event of the same
// type, actor, task and outcome arrived after it (button lines carry no dedupeKey).
export function arrived(local: FeedEvent, server: FeedEvent[]): boolean {
  return server.some((s) => local.dedupeKey
    ? s.dedupeKey === local.dedupeKey
    : s.type === local.type && s.actor === local.actor && detail(s) === detail(local) && ms(s) >= ms(local) - 5000);
}

// What the feed draws: newest first. Fixtures only until the server has answered once.
export function shownEvents(server: FeedEvent[] | null, locals: FeedEvent[], fixtures: FeedEvent[]): FeedEvent[] {
  const base = server ?? fixtures;
  const pending = server ? locals.filter((l) => !arrived(l, server)) : locals;
  return [...pending, ...base].sort((a, b) => ms(b) - ms(a));
}
