// The demo (D-0017): one global state document, the demo clock, and the one function that starts a run.
//
//   meta { _id: "demo" } = { state: "prepping" } | { state: "playing", runId, startedAt, durationS }
//
// startDemo() is the ONLY writer of that document (POST /api/demo/start calls it). The Brain, the
// sweeper and the player only read it: while it says "prepping" they do nothing.
// With no document the clock is the real clock, so live behaviour is unchanged.
// Relative imports only: the workers run under tsx.
import { bumpDeskVersion, cols, newId } from "./db";
import { seed } from "./seed";

/** 36 hours of scenario, whatever the run's length. */
export const SCENARIO_SPAN_S = 36 * 3600;
export const DEFAULT_DURATION_S = 1800;
export const MIN_DURATION_S = 60;
export const MAX_DURATION_S = 7200;
/** The scenario's second 0: 04:17 local in Antakya on 6 Feb 2023. Override with DEMO_T0 (ISO time). */
export const DEFAULT_T0 = "2023-02-06T01:17:00Z";
/** How long a copy of the document may be old. The Brain asks on every turn. */
export const DEMO_CACHE_MS = 1000;

export type DemoDoc =
  | { state: "prepping"; since?: Date }
  | { state: "playing"; runId: string; startedAt: Date; durationS: number };

export class DemoBusyError extends Error {}

/**
 * startDemo() deletes every desk's records. Checks that call it run only against a local Mongo
 * (a throwaway container) or when ALLOW_DEMO_WIPE=1 says so.
 */
export function isThrowawayMongo(): boolean {
  if (process.env.ALLOW_DEMO_WIPE === "1") return true;
  return /^mongodb:\/\/(?:[^@/]*@)?(localhost|127\.0\.0\.1)(:|\/|$)/.test(process.env.MONGODB_URI ?? "");
}

export function demoT0(): number {
  const t = Date.parse(process.env.DEMO_T0 || DEFAULT_T0);
  return Number.isNaN(t) ? Date.parse(DEFAULT_T0) : t;
}

/** Scenario seconds per real second. */
export const demoSpeed = (durationS: number) => SCENARIO_SPAN_S / durationS;

const g = globalThis as typeof globalThis & { __demoDoc?: { at: number; doc: DemoDoc | null } };

/** The demo document, or null when there is none. Up to DEMO_CACHE_MS old unless `fresh`. */
export async function getDemo(opts: { fresh?: boolean; nowMs?: number } = {}): Promise<DemoDoc | null> {
  const nowMs = opts.nowMs ?? Date.now();
  const hit = g.__demoDoc;
  if (!opts.fresh && hit && nowMs - hit.at < DEMO_CACHE_MS && nowMs >= hit.at) return hit.doc;
  const { meta } = await cols();
  const raw = await meta.findOne({ _id: "demo" });
  let doc: DemoDoc | null = null;
  if (raw?.state === "prepping") doc = { state: "prepping", ...(raw.since ? { since: raw.since } : {}) };
  else if (raw?.state === "playing" && raw.runId && raw.startedAt && raw.durationS) {
    doc = { state: "playing", runId: raw.runId, startedAt: raw.startedAt, durationS: raw.durationS };
  }
  g.__demoDoc = { at: nowMs, doc };
  return doc;
}

/** The demo clock for a document: T0 + (now − startedAt) × speed, or `now` when nothing is playing. */
export function demoNowFrom(doc: DemoDoc | null, nowMs: number = Date.now()): Date {
  if (doc?.state !== "playing") return new Date(nowMs);
  return new Date(demoT0() + (nowMs - doc.startedAt.getTime()) * demoSpeed(doc.durationS));
}

/** The time the Brain, the sweeper and the screens use. Real time when there is no demo run. */
export async function demoNow(nowMs: number = Date.now()): Promise<Date> {
  return demoNowFrom(await getDemo({ nowMs }), nowMs);
}

/**
 * The same clock without a database read, for code that stamps a time deep inside a handler. It
 * uses the last copy getDemo() took, however old: a copy only goes wrong when the run itself
 * changes, and every entry point (the Brain's turn, the sweeper tick, an API call) calls getDemo()
 * first. With no copy, or no playing run, it is real time.
 */
export function demoNowSync(nowMs: number = Date.now()): Date {
  return demoNowFrom(g.__demoDoc?.doc ?? null, nowMs);
}

/** True while a demo run is playing (from the last copy, like demoNowSync). */
export function demoPlayingSync(): boolean {
  return g.__demoDoc?.doc?.state === "playing";
}

/** A real receive time (event.ts) as scenario time, so it can be compared with demo-clock stamps. */
export function demoAtSync(t: Date | string | number): Date {
  return demoNowFrom(g.__demoDoc?.doc ?? null, new Date(t).getTime());
}

/** Seconds into the scenario (0 at T0) for a playing run, else null. */
export function scenarioSecond(doc: DemoDoc | null, nowMs: number): number | null {
  if (doc?.state !== "playing") return null;
  return ((nowMs - doc.startedAt.getTime()) / 1000) * demoSpeed(doc.durationS);
}

export interface StartOptions {
  durationS?: number;
  /** The real clock. Checks inject one. */
  now?: () => number;
  /** How long to wait for events the Brain is working on. Default 10 s. */
  waitMs?: number;
  /** Time for other processes' copies of the document to expire before we count working events. */
  settleMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** A "prepping" document older than this is a crashed start: a new press may take over. */
const STALE_PREP_MS = 60_000;

/**
 * Start (or restart) the demo: prep Mongo, then write the playing document.
 *  1. { state: "prepping" }: the Brain and the player stop.
 *  2. Wait up to waitMs for events with status "working" to finish.
 *  3. Delete every desk's records and desk counters.
 *  4. Reseed the users from data/seed.json.
 *  5. Bump the desk versions, so open screens refresh.
 *  6. { state: "playing", runId, startedAt, durationS }.
 * Never touches users' logins, the Brain lease or any audit collection.
 */
export async function startDemo(opts: StartOptions = {}): Promise<{ runId: string; startedAt: Date }> {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? realSleep;
  const durationS = opts.durationS ?? DEFAULT_DURATION_S;
  if (!Number.isFinite(durationS) || durationS < MIN_DURATION_S || durationS > MAX_DURATION_S) {
    throw new RangeError(`durationS must be from ${MIN_DURATION_S} to ${MAX_DURATION_S}`);
  }
  const c = await cols();

  // Two presses at once must not wipe under each other. A crashed start does not block for long.
  const current = await c.meta.findOne({ _id: "demo" });
  if (current?.state === "prepping" && current.since && now() - current.since.getTime() < STALE_PREP_MS) {
    throw new DemoBusyError("the demo is being prepared, try again in a few seconds");
  }

  let runId = "";
  let startedAt = new Date(0);
  try {
    await c.meta.replaceOne({ _id: "demo" }, { state: "prepping", since: new Date(now()) }, { upsert: true });
    g.__demoDoc = undefined;

    // Other processes see "prepping" within DEMO_CACHE_MS; after that the Brain takes no new event.
    await sleep(opts.settleMs ?? DEMO_CACHE_MS + 100);
    const give = now() + (opts.waitMs ?? 10_000);
    while (now() < give && (await c.events.countDocuments({ status: "working" })) > 0) await sleep(200);

    for (const col of [c.events, c.sites, c.needs, c.roads, c.shelters, c.zones, c.incidents, c.tasks, c.inbox, c.messages]) {
      await (col as { deleteMany(f: object): Promise<unknown> }).deleteMany({});
    }
    await c.meta.deleteMany({ _id: { $regex: /^(cases|version):/ } });

    const { deskId } = await seed();
    const desks = new Set([deskId, ...(await c.users.distinct("deskId"))]);
    for (const d of desks) await bumpDeskVersion(d);

    runId = newId();
    startedAt = new Date(now());
    await c.meta.replaceOne({ _id: "demo" }, { state: "playing", runId, startedAt, durationS }, { upsert: true });
    g.__demoDoc = undefined;
  } catch (err) {
    // Never leave the Brain frozen on "prepping": drop the marker so a new press starts clean.
    await c.meta.deleteOne({ _id: "demo", state: "prepping" }).catch(() => undefined);
    g.__demoDoc = undefined;
    throw err;
  }
  return { runId, startedAt };
}
