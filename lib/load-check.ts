// Load and replay check for the Brain: npm run load:check
// On a throwaway desk, "check-load": a fixed set of inline synthetic events (reports, needs,
// a closure, a shelter capacity), no LLM, no cost. All are posted and processed; then the same
// set is posted again (same dedupeKeys: nothing new may appear), and once more as a copy with
// fresh keys (a replay run twice: the copies must merge). The sweeper ticks a few times. Then the
// desk is checked for stuck events, doubled tasks and doubled sites, and wiped (also on failure).
import assert from "node:assert/strict";
import { runOnce } from "../workers/brain";
import { tick } from "../workers/sweeper";
import { closeDb, cols, postEvent } from "./db";
import { wipeDesk } from "./reset";
import { seed } from "./seed";
import type { CapacityPayload, ClosurePayload, EventType, LatLng, NeedPayload, ReportPayload } from "./types";

const DESK = "check-load";
let passed = 0;
const ok = (msg: string) => { passed++; console.log(`ok  ${msg}`); };

interface Planned { type: EventType; key: string; payload: unknown }

const AYSE: LatLng = [36.196, 36.166];
const MOR: LatLng = [36.2125, 36.157];
const report = (text: string, textEn: string, coords: LatLng, peopleCount: number, address?: string): ReportPayload =>
  ({ kind: "trapped", text, textEn, coords, region: "antakya-merkez", peopleCount, ...(address ? { address } : {}) });
const need = (item: string, quantity: number, lifeThreatening: boolean, coords: LatLng): NeedPayload =>
  ({ item, quantity, lifeThreatening, region: "antakya-merkez", coords });
const closure = (road: string, state: ClosurePayload["state"], reason: string, coords: LatLng): ClosurePayload =>
  ({ road, state, reason, coords });
const capacity = (shelter: string, bedsUsed: number, bedsTotal: number, coords: LatLng): CapacityPayload =>
  ({ shelter, bedsUsed, bedsTotal, coords, region: "antakya-merkez" });

/** About eight synthetic payloads. Keys are scoped to this desk. */
function plan(): Planned[] {
  const k = (id: string) => `load:${DESK}:${id}`;
  return [
    { type: "report", key: k("r1"), payload: report("Saray Mah. 1. Sokak No:7 Güneş Apt. enkaz altında 4 kişi, ses veriyorlar.", "Saray Nbhd, 1st Street No:7 Güneş Apt. 4 people under the rubble, answering.", AYSE, 4, "Saray Mah. 1. Sokak No:7 Güneş Apt.") },
    { type: "report", key: k("r2"), payload: report("Güneş Apartmanı'nda dört kişi mahsur, ekip bekliyoruz.", "Four people trapped at Güneş Apartment, waiting for a team.", AYSE, 4, "Saray Mah. 1. Sokak No:7 Güneş Apt.") },
    { type: "report", key: k("r3"), payload: report("Mor Avlu'da iki kişi enkaz altında.", "Two people under the rubble at Mor Avlu.", MOR, 2) },
    { type: "need", key: k("n1"), payload: need("blankets", 40, true, AYSE) },
    { type: "need", key: k("n2"), payload: need("water", 100, false, MOR) },
    { type: "closure", key: k("c1"), payload: closure("İnönü Cad. north", "closed", "rubble on the road", [36.226, 36.159]) },
    { type: "closure", key: k("c2"), payload: closure("Ring road exit 3", "unconfirmed", "hearsay, not seen", [36.202, 36.185]) },
    { type: "capacity", key: k("s1"), payload: capacity("Demo Barınak A", 38, 50, [36.196, 36.16]) },
  ];
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
  const set = plan();
  assert.ok(set.length > 5, "more than five events planned");
  ok(`planned ${set.length} inline synthetic events (no LLM)`);

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
