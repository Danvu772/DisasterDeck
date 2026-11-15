// Load and replay check for the Brain: npm run load:check
// On a throwaway desk, "check-load": every replay tweet (data/tweets_replay.json and
// agents/fixtures/tweets_sample.json) becomes events the way the X agent does it, but with the
// rule-based mock extraction: no LLM, no cost. All are posted and processed; then the same set is
// posted again (same dedupeKeys: nothing new may appear), and once more as a copy with fresh keys
// (a replay run twice: the copies must merge). The sweeper ticks a few times. Then the desk is
// checked for stuck events, doubled tasks and doubled sites, and wiped (also on failure).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { extractTweet, type ReplayTweet } from "../agents/research/x-extract";
import { runOnce } from "../workers/brain";
import { tick } from "../workers/sweeper";
import { closeDb, cols, postEvent } from "./db";
import { wipeDesk } from "./reset";
import { seed } from "./seed";
import type { EventType } from "./types";

const DESK = "check-load";
let passed = 0;
const ok = (msg: string) => { passed++; console.log(`ok  ${msg}`); };

interface Planned { type: EventType; key: string; payload: unknown }

async function plan(): Promise<Planned[]> {
  const files = ["../data/tweets_replay.json", "../agents/fixtures/tweets_sample.json"];
  const out: Planned[] = [];
  for (const f of files) {
    const tweets = JSON.parse(await readFile(new URL(f, import.meta.url), "utf8")) as ReplayTweet[];
    for (const t of tweets) {
      // Keys are scoped to this desk: the X agent's synthetic keys are global and would collide.
      const key = `load:${DESK}:${t.id}`;
      const x = await extractTweet(t, { mock: true });
      if (x.report) out.push({ type: "report", key, payload: x.report });
      x.needs.forEach((p, i) => out.push({ type: "need", key: `${key}:need:${i}`, payload: p }));
      x.closures.forEach((p, i) => out.push({ type: "closure", key: `${key}:closure:${i}`, payload: p }));
      x.capacities.forEach((p, i) => out.push({ type: "capacity", key: `${key}:capacity:${i}`, payload: p }));
    }
  }
  return out;
}

const post = (set: Planned[], suffix = "") =>
  Promise.all(set.map((e) => postEvent({ deskId: DESK, type: e.type, source: "x", actor: "x-agent", dedupeKey: e.key + suffix, payload: e.payload })));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Process until nothing is left on this desk. A live Brain may take some: wait for its "working" ones too. */
async function drain(): Promise<void> {
  const { events } = await cols();
  const deadline = Date.now() + 120_000;
  for (;;) {
    while (await runOnce({ deskId: DESK })) { /* keep going */ }
    const open = await events.countDocuments({ deskId: DESK, status: { $in: ["pending", "working"] } });
    if (!open) return;
    if (Date.now() > deadline) throw new Error(`${open} events still pending or working after 120 s`);
    await sleep(500);
  }
}

async function sweep() {
  for (let i = 0; i < 3; i++) await tick(new Date(), { deskId: DESK });
}

async function counts() {
  const c = await cols();
  return {
    events: await c.events.countDocuments({ deskId: DESK }),
    sites: await c.sites.countDocuments({ deskId: DESK }),
    needs: await c.needs.countDocuments({ deskId: DESK }),
    tasks: await c.tasks.countDocuments({ deskId: DESK }),
  };
}

async function main() {
  await wipeDesk(DESK);
  await seed(DESK);
  const set = await plan();
  assert.ok(set.length > 5, "more than five events planned");
  ok(`planned ${set.length} events from the replay files (mock extraction, no LLM)`);

  const rate = (n: number, ms: number) => `${n} events in ${(ms / 1000).toFixed(2)} s = ${(n / (ms / 1000)).toFixed(1)} events/s`;

  // Run 1.
  let t0 = Date.now();
  const ids1 = await post(set);
  await drain();
  await sweep();
  const ms1 = Date.now() - t0;
  const after1 = await counts();
  assert.equal(after1.events, set.length);
  ok(`replay 1: ${rate(set.length, ms1)}; sites ${after1.sites}, needs ${after1.needs}, tasks ${after1.tasks}`);
  assert.ok(after1.sites > 0, "the replay made sites");

  // Run 2, same keys: nothing new.
  const ids2 = await post(set);
  assert.deepEqual(ids2, ids1, "same dedupeKeys return the old ids");
  await drain();
  const afterSame = await counts();
  assert.deepEqual(afterSame, after1);
  ok("same dedupeKeys posted again: no new event, nothing changed");

  // Run 2, copies with fresh keys.
  t0 = Date.now();
  const ids3 = await post(set, ":copy");
  assert.equal(new Set([...ids1, ...ids3]).size, set.length * 2);
  await drain();
  await sweep();
  const ms3 = Date.now() - t0;
  const after3 = await counts();
  assert.equal(after3.events, set.length * 2);
  assert.equal(after3.sites, after1.sites, "copies merged: no extra sites");
  ok(`replay 2 (fresh keys): ${rate(set.length, ms3)}; sites ${after3.sites} (same as run 1)`);

  // The state of the desk.
  const c = await cols();
  const all = await c.events.find({ deskId: DESK }).toArray();
  const bad = all.filter((e) => !["done", "merged", "rejected"].includes(e.status));
  assert.equal(bad.length, 0, `events not finished: ${bad.map((e) => `${e.type}:${e.status}:${e.result?.reason}`).join("; ")}`);
  assert.ok(all.every((e) => e.result?.reason), "every event has a reason");
  const tally: Record<string, number> = {};
  for (const e of all) tally[e.status] = (tally[e.status] ?? 0) + 1;
  ok(`every event ended done, merged or rejected with a reason (${JSON.stringify(tally)})`);

  const open = await c.tasks.find({ deskId: DESK, open: true }).toArray();
  const seen = new Set(open.map((t) => `${t.recordId}|${t.type}`));
  assert.equal(seen.size, open.length, "no two open tasks share recordId + type");
  ok(`${open.length} open tasks, no recordId + type twice`);
  console.log(`\n${passed} checks passed`);
}

main()
  .catch((err) => {
    console.error("FAILED:", err instanceof Error ? err.stack ?? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await wipeDesk(DESK); } catch (e) { console.error("cleanup failed:", e instanceof Error ? e.message : e); process.exitCode = 1; }
    await closeDb();
  });
