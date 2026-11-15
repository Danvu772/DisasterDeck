// Gap check: npm run gap:check
// The rules added after the Final system design audit (review/task-list.md, T1 to T18). A throwaway
// desk, "check-gap", with its own people and records. Time moves forward by passing `now` to tick(),
// limited to this desk, so the real desk is never touched. Cleans up before and after.
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { runOnce } from "../workers/brain";
import { ANSWER_MINUTES } from "../workers/dispatcher";
import { PROPOSED_QUIET_MS } from "../workers/memory-keeper";
import { ROAD_UNCONFIRMED_MINUTES, SHELTER_STALE_MINUTES, SILENT_MINUTES, tick } from "../workers/sweeper";
import { closeDb, cols, newId, postEvent } from "./db";
import { scored } from "./rules/priority";
import type { Event, EventType, Need, Road, Shelter, Site, Source, Task, User } from "./types";

const DESK = "check-gap";
const R = "gap-merkez";
let passed = 0;
const ok = (msg: string) => { passed++; console.log(`ok  ${msg}`); };
const min = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);

export const U = {
  vOn: "check-gap-vol-on", vOn2: "check-gap-vol-on-2", vOff: "check-gap-vol-off", vNever: "check-gap-vol-never",
  field: "check-gap-field", field2: "check-gap-field-2", shelter: "check-gap-shelter",
  c1: "check-gap-coord-1", c2: "check-gap-coord-2",
  pub1: "check-gap-public-1", pub2: "check-gap-public-2", pub3: "check-gap-public-3",
  supTruck: "check-gap-sup-truck", supFoot: "check-gap-sup-on-foot",
};
const ids = Object.values(U);

function people(now: Date): User[] {
  // Seen "in the future": the check moves its clock forward and these people keep a screen open.
  const live = new Date(now.getTime() + 24 * 3600_000);
  const base = { region: R, status: "available" as const, deskId: DESK, lastSeen: live };
  const mk = (_id: string, role: User["role"], more: Partial<User> = {}): User =>
    ({ ...base, _id, name: _id, role, trust: role === "public" ? "public" : role === "coordinator" || role === "field" ? "official" : "vetted", ...more });
  return [
    mk(U.vOn, "volunteer", { coords: [38.401, 38.4] }), mk(U.vOn2, "volunteer", { coords: [38.45, 38.4] }),
    mk(U.vOff, "volunteer", { coords: [38.4001, 38.4], lastSeen: min(now, -10) }),
    mk(U.vNever, "volunteer", { coords: [38.4, 38.4], lastSeen: undefined }),
    mk(U.field, "field", { coords: [38.402, 38.4], profile: { vehicle: "van" } }),
    mk(U.field2, "field", { coords: [38.6, 38.4], profile: { vehicle: "van" } }),
    mk(U.shelter, "shelter"),
    mk(U.c1, "coordinator"), mk(U.c2, "coordinator"),
    mk(U.pub1, "public"), mk(U.pub2, "public"), mk(U.pub3, "public"),
    mk(U.supTruck, "supplier", { coords: [38.5, 38.4], profile: { vehicle: "truck", stock: { blankets: 100, "hot meals": 100 } } }),
    mk(U.supFoot, "supplier", { coords: [38.4, 38.4], profile: { vehicle: "none", stock: { blankets: 100, "hot meals": 100 } } }),
  ];
}

async function cleanup() {
  const c = await cols();
  await c.inbox.deleteMany({ userId: { $in: ids } });
  await Promise.all([
    c.events.deleteMany({ deskId: DESK }), c.sites.deleteMany({ deskId: DESK }), c.needs.deleteMany({ deskId: DESK }),
    c.roads.deleteMany({ deskId: DESK }), c.shelters.deleteMany({ deskId: DESK }), c.zones.deleteMany({ deskId: DESK }),
    c.incidents.deleteMany({ deskId: DESK }), c.tasks.deleteMany({ deskId: DESK }), c.users.deleteMany({ deskId: DESK }),
    c.meta.deleteMany({ _id: { $in: [`cases:${DESK}`, `version:${DESK}`] } }),
  ]);
}

const site = (id: string, over: Partial<Site> = {}): Site => {
  const since = new Date();
  return {
    _id: id, address: `Gap Street ${id}`, region: R, coords: [38.4, 38.4], peopleTrapped: 1,
    callStatus: "called", status: "open", sources: [], history: [], deskId: DESK, confidence: "confirmed",
    observedAt: since, tier: 0, support: 1, ...scored({ support: 1, waitingSince: since }, since), ...over,
  };
};

const task = (recordId: string, over: Partial<Task>): Task => ({
  _id: newId(), type: "call", recordType: "site", recordId, tried: [], risk: "low", tier: 0, priority: 11,
  status: "assigned", open: true, title: `Call about ${recordId}`, detail: "", deadline: new Date(), history: [], deskId: DESK,
  ...over,
});

let n = 0;
/** Post an event as a person (or the system) on the check desk, then run the Brain until the desk is quiet. */
export async function say<P>(actor: string, type: EventType, payload: P, source: Source = "person"): Promise<Event> {
  const id = await postEvent<P>({ deskId: DESK, type, source, actor, dedupeKey: `check-gap:${Date.now()}:${n++}`, payload });
  await settle();
  return (await (await cols()).events.findOne({ _id: id }))!;
}

async function settle() {
  const { events } = await cols();
  for (let i = 0; i < 100; i++) {
    while (await runOnce({ deskId: DESK })) { /* ours first */ }
    if (!(await events.countDocuments({ deskId: DESK, status: { $in: ["pending", "working"] } }))) return;
    await sleep(300);
  }
  throw new Error("events did not settle");
}

const unread = async (userId: string, filter: Record<string, unknown> = {}) =>
  (await cols()).inbox.find({ userId, status: "unread", ...filter }).toArray();

async function sweeperRows() {
  const c = await cols();
  const now = new Date();

  // T4: a person not seen for 3 minutes loses an unanswered task now, before its deadline.
  await c.sites.insertOne(site("g-off", { callStatus: "not_called" }));
  const tOff = task("g-off", { assignee: U.vOff, deadline: min(now, 30) });
  await c.tasks.insertOne(tOff);
  // T1: an approval nobody answered.
  await c.sites.insertOne(site("g-appr", { callStatus: "verified" }));
  const tAppr = task("g-appr", { type: "rescue", risk: "high", status: "waiting_approval", deadline: min(now, -1), title: "Rescue at g-appr" });
  await c.tasks.insertOne(tAppr);
  await c.inbox.insertMany([U.c1, U.c2].map((u) => ({ _id: newId(), userId: u, taskId: tAppr._id, kind: "approval" as const, priority: 10, status: "unread" as const, ts: now, message: "Approve" })));
  // T5: accepted, no promised time, no word since.
  await c.sites.insertOne(site("g-quiet"));
  const tQuiet = task("g-quiet", {
    assignee: U.vOn2, status: "accepted", deadline: min(now, -30),
    history: [{ ts: min(now, -(SILENT_MINUTES + 5)), by: U.vOn2, source: "person", reason: "accepted" }],
  });
  await c.tasks.insertOne(tQuiet);
  // T2: an old shelter number. T3: a road nobody confirmed.
  const shelter: Shelter = {
    _id: "g-shelter", name: "Gap school", region: R, bedsUsed: 40, bedsTotal: 60, updated: now, history: [], deskId: DESK,
    observedAt: min(now, -(SHELTER_STALE_MINUTES + 15)),
  };
  await c.shelters.insertOne(shelter);
  const road: Road = {
    _id: "g-road", road: "Gap bridge", state: "closed", reason: "debris", coords: [38.403, 38.4], history: [], deskId: DESK,
    confidence: "unconfirmed", observedAt: min(now, -(ROAD_UNCONFIRMED_MINUTES + 5)), region: R, source: "x", trust: "public",
  };
  await c.roads.insertOne(road);
  // T6: a proposed need nobody else asked for.
  const old = new Date(now.getTime() - PROPOSED_QUIET_MS - 60_000);
  const need: Need = {
    _id: "g-burgers", item: "burgers", quantity: 10, region: R, siteIds: [], status: "proposed",
    history: [{ ts: old, by: U.pub1, source: "person", reason: "asked for 10 burgers" }], deskId: DESK, confidence: "unconfirmed",
    lifeThreatening: false, lines: [{ quantity: 10 }], tier: 2, support: 1, requestedBy: [U.pub1], ...scored({ support: 1, waitingSince: old }, now),
  };
  await c.needs.insertOne(need);

  const r1 = await tick(now, { deskId: DESK });

  const off = (await c.tasks.findOne({ _id: tOff._id }))!;
  assert.equal(off.assignee, U.vOn, "the task moved to the nearest person who is around");
  assert(off.tried.includes(U.vOff));
  assert(off.history.some((h) => /counts as offline/.test(h.reason)));
  assert(r1.offline >= 1);
  ok("T4 a person not seen for 3 min: the unanswered task moves on before its deadline");

  const appr = (await c.tasks.findOne({ _id: tAppr._id }))!;
  assert.equal(appr.status, "waiting_approval", "the desk never approves by itself");
  assert.equal(appr.overdue, true); assert.equal(appr.approvalRounds, 1);
  assert(appr.deadline > now, "a new deadline for the next round");
  for (const u of [U.c1, U.c2]) {
    const live = await unread(u, { taskId: tAppr._id, kind: "approval" });
    assert.equal(live.length, 1, "one live approval card per coordinator");
    assert.match(live[0].message, /^Late/);
  }
  await tick(now, { deskId: DESK });
  assert.equal((await c.tasks.findOne({ _id: tAppr._id }))!.approvalRounds, 1, "a second tick in the same round sends nothing");
  await tick(min(now, ANSWER_MINUTES + 1), { deskId: DESK });
  assert.equal((await c.tasks.findOne({ _id: tAppr._id }))!.approvalRounds, 2, "the next round sends it again");
  assert.equal((await unread(U.c1, { taskId: tAppr._id, kind: "approval" })).length, 1);
  ok("T1 an approval nobody answered: marked late, sent again to every coordinator, one card each, never approved by the desk");

  const quiet = (await c.tasks.findOne({ _id: tQuiet._id }))!;
  assert(quiet.checkinAt, "check-in sent");
  assert(quiet.history.some((h) => /no word since they accepted/.test(h.reason)));
  assert.equal((await unread(U.vOn2, { taskId: tQuiet._id, kind: "checkin" })).length, 1);
  ok(`T5 accepted with no promised time and no word for ${SILENT_MINUTES} min: one check-in`);

  const asks = await unread(U.shelter, { key: { $regex: "^stale-shelter:g-shelter" } });
  assert.equal(asks.length, 1); assert.match(asks[0].message, /Is Gap school still 40\/60\? That number is \d+ min old/);
  await tick(min(now, 1), { deskId: DESK });
  assert.equal((await unread(U.shelter, { key: { $regex: "^stale-shelter:g-shelter" } })).length, 1, "asked once per number");
  ok(`T2 a shelter number older than ${SHELTER_STALE_MINUTES} min: the shelter is asked once for the current count`);

  const roadAsk = await unread(U.field, { key: { $regex: "^confirm-road:g-road" } });
  assert.equal(roadAsk.length, 1, "the nearest field team is asked");
  assert.match(roadAsk[0].message, /Can you check Gap bridge/);
  assert.equal((await unread(U.field2, { key: { $regex: "^confirm-road" } })).length, 0, "not the far one");
  ok(`T3 a road unconfirmed for ${ROAD_UNCONFIRMED_MINUTES} min: the nearest free field team is asked to look`);

  const burgers = (await c.needs.findOne({ _id: "g-burgers" }))!;
  assert.equal(burgers.status, "cancelled");
  assert((await unread(U.pub1)).some((i) => /nobody else asked for it in 2 hours/.test(i.message)));
  ok("T6 a proposed need quiet for 2 h is cancelled and the asker hears why");

  await say(U.c1, "approval", { taskId: tAppr._id, approved: true });
  assert.equal((await c.tasks.findOne({ _id: tAppr._id }))!.overdue, undefined, "decided: no longer late");
  ok("T1 a late approval that gets decided is no longer marked late");
}

async function main() {
  await cleanup();
  const c = await cols();
  await c.users.insertMany(people(new Date()));
  await sweeperRows();
  console.log(`\nAll ${passed} checks passed.`);
}

main()
  .catch((err) => { console.error("\nFAILED:", err instanceof Error ? err.stack ?? err.message : err); process.exitCode = 1; })
  .finally(async () => { await cleanup().catch(() => {}); await closeDb(); });
