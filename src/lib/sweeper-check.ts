// Sweeper timers check: npm run sweeper:check
// A throwaway desk, "check-sweep", with its own people, sites, needs and tasks. Time is moved
// forward by passing `now` to tick(), limited to this desk, so the real desk is never touched.
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { runOnce } from "../workers/brain";
import { CHECKIN_GRACE_MINUTES, tick } from "../workers/sweeper";
import { ANSWER_MINUTES } from "../workers/dispatcher";
import { closeDb, cols, newId } from "./db";
import { demoNow, demoNowFrom, demoSpeed, getDemo } from "./demo";
import { scored } from "./rules/priority";
import type { Need, Site, Task, User } from "./types";

const DESK = "check-sweep";
let passed = 0;
const ok = (msg: string) => { passed++; console.log(`ok  ${msg}`); };
const min = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);

const U = { v1: "check-sweep-v1", v2: "check-sweep-v2", v3: "check-sweep-v3", v4: "check-sweep-v4", c1: "check-sweep-c1", c2: "check-sweep-c2" };
const ids = Object.values(U);

function people(): User[] {
  const base = { region: "malatya-merkez", status: "available" as const, deskId: DESK, trust: "vetted" as const };
  const vol = (_id: string, name: string, d: number): User => ({ ...base, _id, name, role: "volunteer", coords: [38.4 + d, 38.4] });
  return [
    vol(U.v1, "Sweep volunteer 1", 0.001), vol(U.v2, "Sweep volunteer 2", 0.002),
    vol(U.v3, "Sweep volunteer 3", 0.003), vol(U.v4, "Sweep volunteer 4", 0.004),
    { ...base, _id: U.c1, name: "Sweep coordinator 1", role: "coordinator", trust: "official" },
    { ...base, _id: U.c2, name: "Sweep coordinator 2", role: "coordinator", trust: "official" },
  ];
}

// DEMO-4: the check writes the global demo document, so it puts back what it found.
let savedDemo: unknown = null;
async function restoreDemo() {
  const { meta } = await cols();
  await meta.deleteOne({ _id: "demo" });
  if (savedDemo) await meta.insertOne(savedDemo as never);
  await getDemo({ fresh: true });
}

async function cleanup() {
  const c = await cols();
  await c.inbox.deleteMany({ userId: { $in: ids } });
  await Promise.all([
    c.events.deleteMany({ deskId: DESK }), c.sites.deleteMany({ deskId: DESK }), c.needs.deleteMany({ deskId: DESK }),
    c.incidents.deleteMany({ deskId: DESK }), c.tasks.deleteMany({ deskId: DESK }), c.users.deleteMany({ deskId: DESK }),
    c.meta.deleteMany({ _id: { $in: [`cases:${DESK}`, `version:${DESK}`] } }),
  ]);
}

const site = (id: string, since: Date): Site => ({
  _id: id, address: `Sweep Street ${id}`, region: "malatya-merkez", coords: [38.4, 38.4], peopleTrapped: 1,
  callStatus: "not_called", status: "open", sources: [], history: [], deskId: DESK, confidence: "unconfirmed",
  observedAt: since, tier: 0, support: 1, ...scored({ support: 1, waitingSince: since }, since),
});

function task(recordId: string, over: Partial<Task>): Task {
  return {
    _id: newId(), type: "call", recordType: "site", recordId, tried: [], risk: "low", tier: 0, priority: 11,
    status: "assigned", open: true, title: `Call about ${recordId}`, detail: "", deadline: new Date(), history: [], deskId: DESK,
    ...over,
  };
}

const inboxOf = async (userId: string, kind: string, taskId: string) =>
  (await cols()).inbox.countDocuments({ userId, kind: kind as never, taskId });

async function settle() {
  const { events } = await cols();
  for (let i = 0; i < 100; i++) {
    while (await runOnce({ deskId: DESK })) { /* ours first */ }
    if (!(await events.countDocuments({ deskId: DESK, status: { $in: ["pending", "working"] } }))) return;
    await sleep(300); // another Brain has one in hand
  }
  throw new Error("events did not settle");
}

async function main() {
  {
    const { seenRecently } = await import("./rules/assign");
    const demo = new Date("2023-02-06T06:00:00Z");
    assert(!seenRecently(new Date("2026-11-21T04:00:00Z"), demo), "a real-time stamp from the future is not seen on the demo clock");
    assert(seenRecently(new Date(demo.getTime() - 60_000), demo), "a stamp a minute ago is seen");
    assert(!seenRecently(new Date(demo.getTime() - 4 * 60_000), demo), "a stamp four minutes ago is not");
    console.log("ok  a lastSeen from the future does not count as seen (demo clock behind real time)");
    passed++;
  }

  await cleanup();
  const c = await cols();
  await c.users.insertMany(people());
  const base = new Date();

  // --- 1. no answer: silence is not a no, and a task never dead-ends on it ---
  // s2 and s3 are already called, so the tick's reconcile pass makes no call task for them and only t1 can time out.
  await c.sites.insertMany([site("s1", min(base, -5)), { ...site("s2", min(base, -5)), callStatus: "called" }, { ...site("s3", min(base, -5)), callStatus: "called" }]);
  const t1 = task("s1", { assignee: U.v1, deadline: min(base, ANSWER_MINUTES) });
  await c.tasks.insertOne(t1);

  let now = min(base, 1);
  await tick(now, { deskId: DESK });
  assert.equal((await c.tasks.findOne({ _id: t1._id }))!.assignee, U.v1, "deadline not reached: nothing happens");

  // v1 never opened the app; v3 has it open (v2 is nearer, but not on the app).
  now = min(base, ANSWER_MINUTES + 1);
  await c.users.updateOne({ _id: U.v3 }, { $set: { lastSeen: now } });
  const r1 = await tick(now, { deskId: DESK });
  let t = (await c.tasks.findOne({ _id: t1._id }))!;
  assert.equal(r1.timedOut, 1);
  assert.equal(t.assignee, U.v3, "the person on the app gets it"); assert.equal(t.status, "assigned");
  assert.deepEqual(t.tried, [], "silence does not go into tried");
  assert(t.history.some((h) => h.reason.startsWith("no answer from")), "history says nobody answered");
  assert(t.deadline > now, "the next person gets a fresh deadline");
  assert.equal(await inboxOf(U.v3, "task", t1._id), 1); assert.equal(await inboxOf(U.v1, "task", t1._id), 0);
  ok("no answer from someone not on the app: the task moves to someone on the app, nobody lands in tried");

  const before = JSON.stringify(await c.tasks.findOne({ _id: t1._id }));
  const again = await tick(now, { deskId: DESK });
  assert.equal(again.timedOut, 0);
  assert.equal(JSON.stringify(await c.tasks.findOne({ _id: t1._id })), before);
  assert.equal(await inboxOf(U.v3, "task", t1._id), 1);
  ok("a second tick at the same time changes nothing");

  // v3 is on the app but slow: the task stays with them, only the deadline is renewed.
  now = min(now, ANSWER_MINUTES + 1);
  await c.users.updateOne({ _id: U.v3 }, { $set: { lastSeen: now } });
  const lines = t.history.length;
  await tick(now, { deskId: DESK });
  t = (await c.tasks.findOne({ _id: t1._id }))!;
  assert.equal(t.assignee, U.v3); assert.equal(t.status, "assigned"); assert.equal(t.history.length, lines);
  assert(t.deadline > now); assert.equal(await inboxOf(U.v3, "task", t1._id), 1);
  // Nobody on the app at all: still with v3, never escalated, no coordinator notice.
  now = min(now, 10);
  await tick(now, { deskId: DESK });
  t = (await c.tasks.findOne({ _id: t1._id }))!;
  assert.equal(t.assignee, U.v3); assert.equal(t.status, "assigned"); assert.equal(t.open, true); assert.deepEqual(t.tried, []);
  for (const co of [U.c1, U.c2]) assert.equal(await inboxOf(co, "notice", t1._id), 0);
  ok("a task stays with a person on the app; with nobody on the app it stays put; silence never escalates it");
  await c.tasks.updateOne({ _id: t1._id }, { $set: { status: "done", open: false } });
  await c.users.updateOne({ _id: U.v3 }, { $unset: { lastSeen: "" } });

  // --- 2. check-in, then unreachable ---
  const t2 = task("s2", { assignee: U.v1, status: "accepted", eta: min(base, 100), deadline: min(base, 100) });
  await c.tasks.insertOne(t2);
  await tick(min(base, 99), { deskId: DESK });
  assert.equal((await c.tasks.findOne({ _id: t2._id }))!.checkinAt, undefined, "before the ETA: no check-in");
  const past = min(base, 101);
  const r2 = await tick(past, { deskId: DESK });
  assert.equal(r2.checkins, 1);
  await tick(past, { deskId: DESK });
  await tick(min(past, 1), { deskId: DESK });
  t = (await c.tasks.findOne({ _id: t2._id }))!;
  assert.equal(t.checkinAt?.getTime(), past.getTime()); assert.equal(t.status, "accepted");
  assert(t.history.some((h) => h.reason.startsWith("check-in sent")));
  assert.equal(await inboxOf(U.v1, "checkin", t2._id), 1, "exactly one check-in");
  const evOf = () => c.events.find({ deskId: DESK, type: "incident", actor: "sweeper" }).toArray();
  assert.equal((await evOf()).length, 0, "not unreachable inside the grace period");
  ok("accepted task past its ETA: exactly one check-in item, no incident yet");

  const late = min(past, CHECKIN_GRACE_MINUTES);
  const r3 = await tick(late, { deskId: DESK });
  assert.equal(r3.unreachable, 1);
  await tick(late, { deskId: DESK });
  await tick(min(late, 1), { deskId: DESK });
  const evs = await evOf();
  assert.equal(evs.length, 1, "exactly one unreachable incident event");
  const p = evs[0].payload as { kind: string; taskId: string; canContinue: boolean };
  assert.equal(p.kind, "unreachable"); assert.equal(p.taskId, t2._id); assert.equal(p.canContinue, false);
  assert.equal(evs[0].source, "system"); assert.equal(evs[0].lane, 0);
  ok("after the grace period exactly one unreachable incident event is posted by the sweeper");

  // The others are on the app, so the replacement has someone to go to (a person never seen gets no task).
  await c.users.updateMany({ _id: { $in: [U.v2, U.v3, U.v4] } }, { $set: { lastSeen: new Date() } });
  await settle();
  const ev = (await c.events.findOne({ _id: evs[0]._id }))!;
  assert.equal(ev.status, "done", ev.result?.reason);
  t = (await c.tasks.findOne({ _id: t2._id }))!;
  assert.equal(t.status, "blocked"); assert.equal(t.open, false); assert(t.tried.includes(U.v1));
  const repl = (await c.tasks.findOne({ replaces: t2._id }))!;
  assert(repl, "a replacement task was made");
  assert.equal(repl.status, "assigned"); assert.notEqual(repl.assignee, U.v1);
  assert.equal(await c.incidents.countDocuments({ deskId: DESK, kind: "unreachable" }), 1);
  ok(`the incident blocks the task and sends a replacement to ${repl.assignee}`);

  // --- 3. priority over time ---
  const t3 = task("s3", { status: "escalated", priority: 11, deadline: min(base, 1000) });
  const need: Need = {
    _id: "n1", item: "blankets", quantity: 5, region: "malatya-merkez", siteIds: [], status: "open",
    history: [{ ts: min(base, -3), by: "x", source: "x", reason: "asked" }], deskId: DESK, confidence: "unconfirmed",
    lifeThreatening: false, lines: [], tier: 1, support: 2, requestedBy: ["a", "b"],
    ...scored({ support: 2, waitingSince: min(base, -3) }, min(base, -3)),
  };
  await c.tasks.insertOne(t3);
  await c.needs.insertOne(need);
  const s3Before = site("s3", min(base, -5)); // earlier ticks moved the stored one already
  const future = min(base, 30);
  const r4 = await tick(future, { deskId: DESK });
  assert(r4.reprioritized >= 2);
  const s3 = (await c.sites.findOne({ _id: "s3" }))!;
  const want = scored({ support: 1, waitingSince: min(base, -5) }, future);
  assert.equal(s3.priority, want.priority); assert(s3.priority > s3Before.priority, "priority grew");
  assert.deepEqual(s3.scoreParts, want.scoreParts);
  assert.equal((await c.tasks.findOne({ _id: t3._id }))!.priority, want.priority, "the open task copied it");
  const n1 = (await c.needs.findOne({ _id: "n1" }))!;
  assert.equal(n1.priority, scored({ support: 2, waitingSince: min(base, -3) }, future).priority); assert(n1.priority > need.priority);
  ok(`waiting grows with time: site ${s3Before.priority} → ${s3.priority}, need ${need.priority} → ${n1.priority}, the task copied it`);

  const snap = JSON.stringify([await c.sites.find({ deskId: DESK }).sort({ _id: 1 }).toArray(), await c.needs.find({ deskId: DESK }).toArray()]);
  await tick(future, { deskId: DESK });
  await tick(new Date(future.getTime() + 40_000), { deskId: DESK }); // same minute of waiting: nothing to write
  assert.equal(JSON.stringify([await c.sites.find({ deskId: DESK }).sort({ _id: 1 }).toArray(), await c.needs.find({ deskId: DESK }).toArray()]), snap);
  ok("a repeat tick writes no records whose value did not change");

  // --- 6. DEMO-4: the timers run on the demo clock, the process timers on the real one ---
  // The real clock is injected (R0 + n seconds), nothing sleeps. startedAt is R0 - 10 s, 1800 s long:
  // 72x, scenario time T0 + 720 s at R0.
  await c.tasks.deleteMany({ deskId: DESK }); await c.inbox.deleteMany({ userId: { $in: ids } });
  // Earlier cases left people busy or seen: start from available people nobody has seen.
  await c.users.updateMany({ deskId: DESK }, { $set: { status: "available" }, $unset: { lastSeen: "" } });
  savedDemo = await c.meta.findOne({ _id: "demo" });
  const R0 = new Date();
  const doc = { state: "playing" as const, runId: "check-demo-4", startedAt: new Date(R0.getTime() - 10_000), durationS: 1800 };
  await c.meta.replaceOne({ _id: "demo" }, doc, { upsert: true });
  await getDemo({ fresh: true });
  assert.equal(demoSpeed(1800), 72);
  const realAt = (s: number) => new Date(R0.getTime() + s * 1000);
  const worldAt = (s: number) => demoNowFrom(doc, realAt(s).getTime());
  // What POST /api/demo/presence does: lastSeen = demoNow(), at the real moment of the beat.
  const present = (userId: string, s: number) => demoNow(realAt(s).getTime()).then((t) => c.users.updateOne({ _id: userId }, { $set: { lastSeen: t } }));
  // Every site is called, so reconcile makes no task of its own.
  await c.sites.deleteMany({ deskId: DESK });
  await c.sites.insertMany(["d1", "d2"].map((id) => ({ ...site(id, worldAt(0)), callStatus: "called" as const })));
  const d1 = task("d1", { assignee: U.v1, deadline: new Date(worldAt(0).getTime() + 10 * 60_000), history: [] });
  await c.tasks.insertOne(d1);

  // 10 scenario minutes are 600 / 72 = 8.33 real seconds.
  await present(U.v1, 8);
  const early = await tick(undefined, { deskId: DESK, realNow: realAt(8) });
  assert.equal(early.timedOut, 0, "at 8.0 real s (576 scenario s) the 10-minute deadline has not passed");
  assert.equal(+(await c.tasks.findOne({ _id: d1._id }))!.deadline, +d1.deadline);
  await present(U.v1, 8.5);
  const lateTick = await tick(undefined, { deskId: DESK, realNow: realAt(8.5) });
  assert.equal(lateTick.timedOut, 1, "at 8.5 real s (612 scenario s) it has");
  const renewed = (await c.tasks.findOne({ _id: d1._id }))!;
  assert.equal(renewed.assignee, U.v1, "their screen is open: the task stays");
  assert.equal(+renewed.deadline - +worldAt(8.5), ANSWER_MINUTES * 60_000, "the new deadline is ANSWER_MINUTES of scenario time ahead");
  ok(`DEMO-4: a 10-minute no-answer timeout at 72x fires after 8.33 real seconds (not at 8.0, yes at 8.5), the new deadline is on the demo clock`);

  // A person stamped by presence counts as seen on the demo clock; one never stamped does not.
  await c.tasks.deleteMany({ deskId: DESK });
  const d2 = task("d2", { assignee: U.v4, deadline: new Date(worldAt(20).getTime() - 60_000) });
  await c.tasks.insertOne(d2);
  await present(U.v2, 20);
  const moved = await tick(undefined, { deskId: DESK, realNow: realAt(20) });
  assert.equal(moved.timedOut, 1);
  const d2n = (await c.tasks.findOne({ _id: d2._id }))!;
  assert.equal(d2n.assignee, U.v2, "the person presence stamped is seen: the task moves to them");
  assert.deepEqual(d2n.tried, [], "silence is not a no");
  // Three scenario minutes are 2.5 real seconds: three real seconds later the stamp is old.
  await c.tasks.deleteMany({ deskId: DESK });
  const d3 = task("d2", { assignee: U.v2, deadline: new Date(worldAt(23).getTime() - 60_000) });
  await c.tasks.insertOne(d3);
  await present(U.v3, 23);
  const offline = await tick(undefined, { deskId: DESK, realNow: realAt(23) });
  assert.equal((await c.tasks.findOne({ _id: d3._id }))!.assignee, U.v3, "v2's stamp is 3 real s (216 scenario s) old: offline, the task moves to the one seen now");
  assert(offline.timedOut === 1);
  ok("DEMO-4: presence stamped on the demo clock counts as seen; 3 real seconds later it has aged out (3 scenario minutes = 2.5 s)");

  // Process faults stay on the real clock: an event locked 20 real seconds ago is not stuck (30 s), though 20 s is 24 scenario minutes.
  const stuckId = newId();
  await c.events.insertOne({ _id: stuckId, deskId: DESK, ts: R0, observedAt: R0, type: "report", source: "system", actor: "sweeper", lane: 0,
    status: "working", lockedAt: new Date(R0.getTime()), attempts: 1, payload: {} } as never);
  await tick(undefined, { deskId: DESK, realNow: realAt(20) });
  assert.equal((await c.events.findOne({ _id: stuckId }))!.status, "working", "20 real s locked: not stuck");
  await tick(undefined, { deskId: DESK, realNow: realAt(31) });
  assert.equal((await c.events.findOne({ _id: stuckId }))!.status, "pending", "31 real s locked: requeued");
  await c.events.deleteOne({ _id: stuckId });
  ok("DEMO-4: the stuck-event timer stays on the real clock (30 real seconds, not scenario time)");

  // Control: no demo document, the sweeper's own clock is real time.
  await restoreDemo();
  await c.tasks.deleteMany({ deskId: DESK });
  const c1 = task("d1", { assignee: U.v1, deadline: new Date(Date.now() - 1000) });
  await c.tasks.insertOne(c1);
  await c.users.updateOne({ _id: U.v1 }, { $set: { lastSeen: new Date() } });
  const real = await tick(undefined, { deskId: DESK });
  assert.equal(real.timedOut, 1, "no demo document: a deadline one real second ago has passed");
  assert(Math.abs(+(await c.tasks.findOne({ _id: c1._id }))!.deadline - (Date.now() + ANSWER_MINUTES * 60_000)) < 20_000, "and the new deadline is real time");
  ok("DEMO-4 control: with no demo document the timers read real time");

  console.log(`\nAll ${passed} checks passed.`);
}

main()
  .catch((err) => { console.error("\nFAILED:", err instanceof Error ? err.stack ?? err.message : err); process.exitCode = 1; })
  .finally(async () => { await cleanup(); await restoreDemo().catch(() => undefined); await closeDb(); });
