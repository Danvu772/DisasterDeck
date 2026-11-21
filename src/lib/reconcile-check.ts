// Check for the every-tick pass: npm run reconcile:check
// Records that were already on the desk get their tasks (reconcile), and an escalated task goes to the
// first person who is free and fits (redelegate). Throwaway desk "check-reconcile"; nothing else is touched.
import assert from "node:assert/strict";
import { tick } from "../workers/sweeper";
import { MAX_TRIES } from "../workers/dispatcher";
import { closeDb, cols, newId } from "./db";
import { scored } from "./rules/priority";
import type { Site, Task, User } from "./types";

const DESK = "check-reconcile";
let passed = 0;
const ok = (msg: string) => { passed++; console.log(`ok  ${msg}`); };

const site = (id: string, over: Partial<Site> = {}): Site => ({
  _id: id, address: `Reconcile Street ${id}`, region: "malatya-merkez", coords: [38.4, 38.4], peopleTrapped: 1,
  callStatus: "not_called", status: "open", sources: [], history: [], deskId: DESK, confidence: "unconfirmed",
  observedAt: new Date(), tier: 0, support: 1, ...scored({ support: 1, waitingSince: new Date() }, new Date()),
  ...over,
});

const volunteer = (id: string, now: Date): User => ({
  _id: id, name: id, role: "volunteer", region: "malatya-merkez", status: "available", deskId: DESK,
  trust: "public", coords: [38.401, 38.401], lastSeen: now,
} as User);

function escalated(recordId: string, over: Partial<Task> = {}): Task {
  return {
    _id: newId(), type: "call", recordType: "site", recordId, tried: [], risk: "low", tier: 0, priority: 10,
    status: "escalated", open: true, title: `Call about ${recordId}`, detail: "", deadline: new Date(0),
    history: [{ ts: new Date(), by: "dispatcher", reason: "escalated, nobody fits" }], deskId: DESK, ...over,
  } as Task;
}

async function cleanup() {
  const c = await cols();
  const q = { deskId: DESK };
  await Promise.all([c.sites.deleteMany(q), c.tasks.deleteMany(q), c.users.deleteMany(q), c.inbox.deleteMany({ userId: /^check-rc-/ }), c.events.deleteMany(q)]);
  await c.meta.deleteMany({ _id: `version:${DESK}` as never });
}

async function main() {
  await cleanup();
  const c = await cols();
  const now = new Date();
  await c.users.insertOne(volunteer("check-rc-v1", now));
  // Test 1: a site that was already on the desk and never got a call task.
  await c.sites.insertOne(site("check-rc-a"));
  await tick(now, { deskId: DESK });
  const callA = await c.tasks.find({ recordId: "check-rc-a", type: "call", open: true }).toArray();
  assert.equal(callA.length, 1, "one call task for the existing site");
  assert.equal(callA[0].assignee, "check-rc-v1", "assigned to the free volunteer");
  assert.equal(await c.inbox.countDocuments({ userId: "check-rc-v1", taskId: callA[0]._id }), 1, "one inbox item");
  const r2 = await tick(now, { deskId: DESK });
  assert.equal(await c.tasks.countDocuments({ recordId: "check-rc-a", type: "call" }), 1, "second tick makes nothing");
  assert.equal(r2.created, 0, "second tick reports nothing created");
  ok("a site already on the desk gets its call task on the next tick, once, with an inbox item");

  // Test 2: an escalated task waits until a volunteer comes free, then goes to that volunteer.
  await c.sites.insertOne(site("check-rc-b", { callStatus: "called", status: "open", peopleTrapped: 0 }));
  await c.users.updateOne({ _id: "check-rc-v1" }, { $set: { status: "busy" } });
  const tb = escalated("check-rc-b", { type: "call" });
  await c.tasks.insertOne(tb);
  await tick(now, { deskId: DESK });
  assert.equal((await c.tasks.findOne({ _id: tb._id }))!.status, "escalated", "nobody free: still escalated");
  await c.users.insertOne(volunteer("check-rc-v2", new Date()));
  const r3 = await tick(new Date(), { deskId: DESK });
  const tb2 = (await c.tasks.findOne({ _id: tb._id }))!;
  assert.equal(tb2.status, "assigned"); assert.equal(tb2.assignee, "check-rc-v2");
  assert.equal(r3.reassigned, 1);
  assert.equal(await c.inbox.countDocuments({ userId: "check-rc-v2", taskId: tb._id }), 1, "the new owner gets one inbox item");
  ok("an escalated task goes to the first volunteer who comes free, with a history line and an inbox item");

  // Test 3: a task that said no MAX_TRIES times is not offered again by the tick.
  await c.sites.insertOne(site("check-rc-c", { callStatus: "called", peopleTrapped: 0 }));
  const tc = escalated("check-rc-c", { tried: Array.from({ length: MAX_TRIES }, (_, i) => `old-${i}`) });
  await c.tasks.insertOne(tc);
  await tick(new Date(), { deskId: DESK });
  assert.equal((await c.tasks.findOne({ _id: tc._id }))!.status, "escalated", "said no three times: stays escalated");
  ok("a task that said no three times stays escalated for a coordinator");

  // Test 4: a task on a closed site is left alone.
  await c.sites.insertOne(site("check-rc-d", { callStatus: "called", status: "closed", peopleTrapped: 0 }));
  const td = escalated("check-rc-d");
  await c.tasks.insertOne(td);
  await tick(new Date(), { deskId: DESK });
  assert.equal((await c.tasks.findOne({ _id: td._id }))!.status, "escalated", "closed site: not reassigned");
  ok("an escalated task on a closed site is not reassigned");

  await cleanup();
  console.log(`\n${passed} checks passed`);
}

main()
  .then(() => closeDb())
  .catch(async (err) => {
    console.error("reconcile-check failed:", err);
    await cleanup().catch(() => {});
    await closeDb();
    process.exit(1);
  });
