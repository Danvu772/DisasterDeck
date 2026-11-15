// Owned by Role 1. The sweeper: timers, run from the Brain loop every few seconds.
// Today: events stuck in "working" (a Brain that crashed mid-event) go back to the queue.
// Later (CP2–CP4): no answer → next person, ETA passed → check-in, stale shelter numbers.
import { cols } from "../lib/db";

export const STUCK_AFTER_MS = 30_000;
export const MAX_ATTEMPTS = 3;

export async function tick(now: Date = new Date()): Promise<{ requeued: number; failed: number }> {
  const { events } = await cols();
  const stuck = { status: "working" as const, lockedAt: { $lt: new Date(now.getTime() - STUCK_AFTER_MS) } };
  const failed = await events.updateMany(
    { ...stuck, attempts: { $gte: MAX_ATTEMPTS } },
    { $set: { status: "failed", result: { recordIds: [], reason: `stuck in working ${MAX_ATTEMPTS} times` } }, $unset: { lockedAt: "" } },
  );
  const requeued = await events.updateMany(
    { ...stuck, attempts: { $lt: MAX_ATTEMPTS } },
    { $set: { status: "pending" }, $unset: { lockedAt: "" } },
  );
  return { requeued: requeued.modifiedCount, failed: failed.modifiedCount };
}
