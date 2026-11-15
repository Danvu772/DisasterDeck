// Owned by Role 1. The sweeper: timers, run from the Brain loop every few seconds.
//   1. Events stuck in "working" (a Brain that crashed mid-event) go back to the queue.
//   2. An assigned task past its deadline: no answer, next person (the dispatcher does it).
//   3. An accepted task past its ETA: one check-in. Still silent after the grace period: an
//      "unreachable" incident event, so the usual incident path protects the mission.
//   4. Every PRIORITY_EVERY_MS: the waiting part of the score grows, so recompute it.
//   5. Every tick: the dispatcher's rules over the open records (tasks for records that were already
//      there), and escalated tasks offered to whoever is free now.
// The sweeper writes no tasks, inbox items or records. It asks the dispatcher and the memory
// keeper (the only writers) or posts an event. Every step is a conditional update or a deduped
// event, so two overlapping ticks, or a restart, handle each task once.
import { bumpDeskVersion, cols, postEvent } from "../lib/db";
import type { IncidentPayload } from "../lib/types";
import { checkIn, reconcile, redelegate, syncPriority, timedOut } from "./dispatcher";
import { refreshPriorities } from "./memory-keeper";

export const STUCK_AFTER_MS = 30_000;
export const MAX_ATTEMPTS = 3;
/** After the check-in, this long without a new answer and the person counts as unreachable. */
export const CHECKIN_GRACE_MINUTES = 2;
/** Priority is recomputed at most this often (the tick itself runs every 5 s). */
export const PRIORITY_EVERY_MS = 30_000;

export interface TickResult {
  requeued: number; failed: number; timedOut: number; checkins: number; unreachable: number; reprioritized: number;
  created: number; reassigned: number;
}

let lastPriorityAt: number | null = null;

/** `now` lets a check move time forward. `deskId` limits the tick to one desk (checks use it). */
export async function tick(now: Date = new Date(), opts: { deskId?: string } = {}): Promise<TickResult> {
  const { events, tasks } = await cols();
  const desk = opts.deskId ? { deskId: opts.deskId } : {};

  const stuck = { ...desk, status: "working" as const, lockedAt: { $lt: new Date(now.getTime() - STUCK_AFTER_MS) } };
  const failed = await events.updateMany(
    { ...stuck, attempts: { $gte: MAX_ATTEMPTS } },
    { $set: { status: "failed", result: { recordIds: [], reason: `stuck in working ${MAX_ATTEMPTS} times` } }, $unset: { lockedAt: "" } },
  );
  const requeued = await events.updateMany(
    { ...stuck, attempts: { $lt: MAX_ATTEMPTS } },
    { $set: { status: "pending" }, $unset: { lockedAt: "" } },
  );

  // No answer → next person.
  let timed = 0;
  for (const t of await tasks.find({ ...desk, status: "assigned", open: true, deadline: { $lt: now } }).toArray()) {
    await timedOut(t, now);
    timed++;
  }

  // Past the promised time → check in; still silent after the grace → unreachable.
  let checkins = 0;
  for (const t of await tasks.find({ ...desk, status: "accepted", open: true, eta: { $lt: now }, checkinAt: { $exists: false } }).toArray()) {
    if (await checkIn(t, now)) checkins++;
  }
  let unreachable = 0;
  const silentSince = new Date(now.getTime() - CHECKIN_GRACE_MINUTES * 60_000);
  for (const t of await tasks.find({ ...desk, status: "accepted", open: true, checkinAt: { $lte: silentSince } }).toArray()) {
    // A newer ETA than the check-in is a new answer.
    if (!t.assignee || (t.eta && t.checkinAt && t.eta > t.checkinAt)) continue;
    const payload: IncidentPayload = {
      kind: "unreachable", taskId: t._id, canContinue: false,
      text: `${t.assignee} did not answer the check-in for ${CHECKIN_GRACE_MINUTES} min`,
      textEn: `${t.assignee} passed the promised time, was asked "still on your way?" and did not answer for ${CHECKIN_GRACE_MINUTES} min`,
    };
    await postEvent<IncidentPayload>({
      deskId: t.deskId, type: "incident", source: "system", actor: "sweeper",
      dedupeKey: `sweeper:unreachable:${t._id}`, payload,
    });
    unreachable++;
  }

  // Time passes: priorities grow.
  let reprioritized = 0;
  if (lastPriorityAt === null || Math.abs(now.getTime() - lastPriorityAt) >= PRIORITY_EVERY_MS) {
    lastPriorityAt = now.getTime();
    const changed = await refreshPriorities(now, opts.deskId);
    reprioritized = changed.length;
    if (changed.length) await syncPriority(changed);
  }

  // The rules over what is on the desk now, and escalated tasks tried again. Both write through the dispatcher.
  const rec = await reconcile(opts.deskId);
  const re = await redelegate(opts.deskId, now);
  for (const d of new Set([...rec.desks, ...re.desks])) await bumpDeskVersion(d);

  return {
    requeued: requeued.modifiedCount, failed: failed.modifiedCount, timedOut: timed, checkins, unreachable, reprioritized,
    created: rec.created, reassigned: re.moved,
  };
}
