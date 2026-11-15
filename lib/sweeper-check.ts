// Sweeper timers check: npm run sweeper:check
// A throwaway desk, "check-sweep", with its own people, sites, needs and tasks. Time is moved
// forward by passing `now` to tick(), limited to this desk, so the real desk is never touched.
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { runOnce } from "../workers/brain";
import { CHECKIN_GRACE_MINUTES, tick } from "../workers/sweeper";
import { ANSWER_MINUTES, MAX_TRIES } from "../workers/dispatcher";
import { closeDb, cols, newId } from "./db";
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
  await cleanup();
  const c = await cols();
  await c.users.insertMany(people());
  const base = new Date();

  // --- 1. no answer, next person ---
  await c.sites.insertMany([site("s1", min(base, -5)), site("s2", min(base, -5)), site("s3", min(base, -5))]);
  const t1 = task("s1", { assignee: U.v1, deadline: min(base, ANSWER_MINUTES) });
  await c.tasks.insertOne(t1);

  let now = min(base, 1);
  await tick(now, { deskId: DESK });
  assert.equal((await c.tasks.findOne({ _id: t1._id }))!.assignee, U.v1, "deadline not reached: nothing happens");
  now = min(base, ANSWER_MINUTES + 1);
  const r1 = await tick(now, { deskId: DESK });
  let t = (await c.tasks.findOne({ _id: t1._id }))!;
  assert.equal(r1.timedOut, 1);
  assert.equal(t.assignee, U.v2, "nearest not yet asked: volunteer 2"); assert.equal(t.status, "assigned");
  assert.deepEqual(t.tried, [U.v1]);
  assert(t.history.some((h) => h.reason.startsWith("timed out")), "history says it timed out");
  assert(t.deadline > now, "the next person gets a fresh deadline");
  assert.equal(await inboxOf(U.v2, "task", t1._id), 1); assert.equal(await inboxOf(U.v1, "task", t1._id), 0);
  ok("assigned task past its deadline goes to the next person, the first lands in tried, one inbox item for the new one");

  const before = JSON.stringify(await c.tasks.findOne({ _id: t1._id }));
  const again = await tick(now, { deskId: DESK });
  assert.equal(again.timedOut, 0);
  assert.equal(JSON.stringify(await c.tasks.findOne({ _id: t1._id })), before);
  assert.equal(await inboxOf(U.v2, "task", t1._id), 1);
  ok("a second tick at the same time changes nothing");

  now = min(now, ANSWER_MINUTES + 1);
  await tick(now, { deskId: DESK });
  t = (await c.tasks.findOne({ _id: t1._id }))!;
  assert.equal(t.assignee, U.v3); assert.deepEqual(t.tried, [U.v1, U.v2]);
  assert.equal(await inboxOf(U.v1, "task", t1._id), 0); assert.equal(await inboxOf(U.v2, "task", t1._id), 1);
  now = min(now, ANSWER_MINUTES + 1);
  await tick(now, { deskId: DESK });
  t = (await c.tasks.findOne({ _id: t1._id }))!;
  assert.equal(t.tried.length, MAX_TRIES); assert.equal(t.status, "escalated"); assert.equal(t.assignee, undefined);
  assert.equal(t.open, true);
  for (const co of [U.c1, U.c2]) assert.equal(await inboxOf(co, "notice", t1._id), 1, `${co} got a notice`);
  await tick(now, { deskId: DESK });
  for (const co of [U.c1, U.c2]) assert.equal(await inboxOf(co, "notice", t1._id), 1);
  ok(`after ${MAX_TRIES} timeouts the task is escalated, each coordinator gets one notice, never repeated`);

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

  console.log(`\nAll ${passed} checks passed.`);
}

main()
  .catch((err) => { console.error("\nFAILED:", err instanceof Error ? err.stack ?? err.message : err); process.exitCode = 1; })
  .finally(async () => { await cleanup(); await closeDb(); });
