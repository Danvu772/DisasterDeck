// The desk feed as screens see it: phone numbers masked in every string of the payload.
// Shared by GET /api/events and the server-rendered first paint (app/page.tsx).
// Relative imports only, so the Node workers (run with tsx) can load this file too.
import { maskPhones } from "../agents/shared/privacy";
import { cols, deskId } from "./db";
import type { Event } from "./types";

/**
 * The stored event keeps what was posted (the keeper needs the original text). The feed is read
 * by every screen, so phone numbers are masked on the way out, in every string of the payload and of the post's origin.
 */
function maskDeep(value: unknown): unknown {
  if (typeof value === "string") return maskPhones(value).text;
  if (Array.isArray(value)) return value.map(maskDeep);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, maskDeep(v)]));
  }
  return value;
}

export function maskEvent<E extends Event>(e: E): E {
  return {
    ...e,
    payload: maskDeep(e.payload),
    ...(e.origin ? { origin: maskDeep(e.origin) as E["origin"] } : {}),
    ...(e.result ? { result: { ...e.result, reason: maskPhones(e.result.reason).text } } : {}),
  };
}

export const FEED_PROJECTION = { lockedAt: 0, attempts: 0 } as const;

/** The latest `limit` events of one desk, oldest first, masked. Same as GET /api/events with no `since`. */
export async function latestFeed(limit: number, desk: string = deskId()): Promise<Event[]> {
  const { events } = await cols();
  const feed = await events.find({ deskId: desk }, { projection: FEED_PROJECTION }).sort({ ts: -1 }).limit(limit).toArray();
  return feed.reverse().map(maskEvent);
}
