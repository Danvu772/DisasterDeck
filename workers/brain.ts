// Owned by Role 1. The Brain: ONE loop. Take the next event, let the memory keeper apply it,
// let the dispatcher react, and every few seconds run the sweeper (Final system design §10).
//
//   npm run brain
//
// Only one Brain may run against a database: it holds a lease in `meta`. Start a second one
// (a teammate on the same Atlas cluster) and it waits until the first stops or dies.
import { hostname } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { bumpDeskVersion, closeDb, cols, markLoop } from "../lib/db";
import type { Event } from "../lib/types";
import * as dispatcher from "./dispatcher";
import { apply, HANDLED } from "./memory-keeper";
import * as sweeper from "./sweeper";

const ME = `${hostname()}:${process.pid}`;
const LEASE_MS = 15_000;
const log = (...m: unknown[]) => console.log(`[brain ${new Date().toISOString().slice(11, 19)}]`, ...m);

/** Hold or renew the lease. False when another live Brain holds it. */
export async function acquireLease(now = new Date()): Promise<boolean> {
  const { meta } = await cols();
  try {
    await meta.updateOne(
      { _id: "brain-lease", $or: [{ holder: ME }, { until: { $lt: now } }] },
      { $set: { holder: ME, until: new Date(now.getTime() + LEASE_MS) } },
      { upsert: true },
    );
    return true;
  } catch (err) {
    // The lease exists, is someone else's and has not run out: the upsert hit the _id.
    if ((err as { code?: number }).code === 11000) return false;
    throw err;
  }
}

export async function releaseLease(): Promise<void> {
  const { meta } = await cols();
  await meta.updateOne({ _id: "brain-lease", holder: ME }, { $set: { until: new Date(0) } });
}

/** Take the next event: lane 0 (people, sweeper) first, then the oldest. Atomic. */
export async function takeNext(filter: { deskId?: string } = {}): Promise<Event | null> {
  const { events } = await cols();
  return events.findOneAndUpdate(
    { status: "pending", type: { $in: HANDLED }, ...filter },
    { $set: { status: "working", lockedAt: new Date() }, $inc: { attempts: 1 } },
    { sort: { lane: 1, ts: 1 }, returnDocument: "after" },
  );
}

/** Apply one event and record how it ended. Never throws: a failing event is retried, then failed. */
export async function processEvent(event: Event): Promise<void> {
  const { events } = await cols();
  try {
    const out = await apply(event);
    await events.updateOne({ _id: event._id }, { $set: { status: out.status, result: out.result }, $unset: { lockedAt: "" } });
    log(`${event.type} ${event._id} (${event.source}) → ${out.status} ${out.result.recordIds.join(", ")}: ${out.result.reason}`);
    await dispatcher.react(out.changes, out.actions);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const giveUp = (event.attempts ?? 1) >= sweeper.MAX_ATTEMPTS;
    await events.updateOne(
      { _id: event._id },
      giveUp
        ? { $set: { status: "failed", result: { recordIds: [], reason } }, $unset: { lockedAt: "" } }
        : { $set: { status: "pending" }, $unset: { lockedAt: "" } },
    );
    log(`${event.type} ${event._id} ${giveUp ? "FAILED" : `error (attempt ${event.attempts}), will retry`}: ${reason}`);
  } finally {
    // Records may have changed (even a failed apply can write part of its work): tell the
    // readers' board copies to refresh. Best effort; their copies also expire after 20 s.
    await bumpDeskVersion(event.deskId).catch((e) => log(`version bump failed: ${e instanceof Error ? e.message : e}`));
  }
}

/** One turn without the lease or the timers. Used by npm run keeper:check. */
export async function runOnce(filter: { deskId?: string } = {}): Promise<boolean> {
  const event = await takeNext(filter);
  if (event) await processEvent(event);
  return Boolean(event);
}

async function main() {
  let stopping = false;
  const stop = () => { stopping = true; };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  log(`starting as ${ME}, handling: ${HANDLED.join(", ")}`);
  let waiting = false;
  let lastSweep = 0;
  let lastBeat = 0;

  while (!stopping) {
    if (!(await acquireLease())) {
      if (!waiting) {
        const { meta } = await cols();
        const lease = await meta.findOne({ _id: "brain-lease" });
        log(`another Brain is running (${lease?.holder}). Waiting for it to stop...`);
        waiting = true;
      }
      await sleep(5000);
      continue;
    }
    if (waiting) { log("lease acquired, running"); waiting = false; }

    const event = await takeNext();
    if (event) await processEvent(event);

    const now = Date.now();
    if (now - lastSweep >= 5000) {
      lastSweep = now;
      const s = await sweeper.tick();
      if (s.requeued || s.failed) log(`sweeper: ${s.requeued} stuck event(s) back to pending, ${s.failed} failed`);
      if (s.timedOut || s.checkins || s.unreachable || s.reprioritized) {
        log(`sweeper: ${s.timedOut} no answer, ${s.checkins} check-in(s), ${s.unreachable} unreachable, ${s.reprioritized} priority update(s)`);
      }
    }
    if (now - lastBeat >= 1000) { lastBeat = now; await markLoop(); }
    if (!event) await sleep(300);
  }

  log("stopping");
  await releaseLease();
  await closeDb();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (err) => {
    console.error("[brain] crashed:", err);
    await closeDb();
    process.exit(1);
  });
}
