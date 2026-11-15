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
import { closeDb, cols, getBoard, newId, postEvent } from "./db";
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
  vHand: "check-gap-vol-shift-ends", vGone: "check-gap-vol-walked-away",
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
    mk(U.vHand, "volunteer", { coords: [38.7, 38.7] }),
    mk(U.vGone, "volunteer", { coords: [37.9, 37.9], lastSeen: min(now, -10) }),
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

async function pins() {
  const c = await cols();
  const now = new Date();
  await c.sites.insertMany([
    site("g-pin-low", { support: 1, ...scored({ support: 1, waitingSince: now }, now) }),
    site("g-pin-high", { support: 4, ...scored({ support: 4, waitingSince: now }, now) }),
    site("g-pin-tier1", { tier: 1, peopleTrapped: 0, support: 1, ...scored({ support: 1, waitingSince: now }, now) }),
  ]);
  const t = task("g-pin-low", { assignee: U.vOn, status: "accepted", priority: 10 });
  await c.tasks.insertOne(t);

  let ev = await say(U.vOn, "correction", { action: "edit", recordType: "site", recordId: "g-pin-low", fields: { pin: "top" }, reason: "family called the desk twice" });
  assert.equal(ev.status, "rejected"); assert.match(ev.result!.reason, /only a coordinator/);
  ok("T7 only a coordinator can pin");

  ev = await say(U.c1, "correction", { action: "edit", recordType: "site", recordId: "g-pin-low", fields: { pin: "top" }, reason: "family called the desk twice" });
  assert.equal(ev.status, "merged", ev.result?.reason);
  let low = (await c.sites.findOne({ _id: "g-pin-low" }))!;
  const high = (await c.sites.findOne({ _id: "g-pin-high" }))!;
  assert.equal(low.pin?.dir, "top"); assert.equal(low.pin?.by, U.c1);
  assert(low.priority > high.priority, "pinned goes first in its tier");
  assert(low.scoreParts!.some((p) => p.name === "pinned by a coordinator"));
  assert(low.history.some((h) => /pinned to the top of tier 0 by check-gap-coord-1: family called the desk twice/.test(h.reason)), "the reason is on the record");
  assert.equal((await c.tasks.findOne({ _id: t._id }))!.priority, low.priority, "the open task copied the new priority");
  ok("T7 a pin to the top: first in its tier, the reason in the history, the task follows");

  await c.sites.updateOne({ _id: "g-pin-tier1" }, { $set: { priority: 0 } });
  await say(U.c1, "correction", { action: "edit", recordType: "site", recordId: "g-pin-tier1", fields: { pin: "top" }, reason: "test" });
  const order = (await getBoard(DESK)).sites.map((x) => x._id).filter((id) => id.startsWith("g-pin"));
  assert.deepEqual(order, ["g-pin-low", "g-pin-high", "g-pin-tier1"], "tier always wins, even over a pin");
  ok("T7 tier still wins: a pinned tier 1 site stays below every tier 0 site");

  await tick(new Date(Date.now() + 10 * 60_000), { deskId: DESK });
  low = (await c.sites.findOne({ _id: "g-pin-low" }))!;
  assert(low.scoreParts!.some((p) => p.name === "pinned by a coordinator"), "time passing keeps the pin");
  await say(U.c1, "correction", { action: "edit", recordType: "site", recordId: "g-pin-low", fields: { pin: "down" }, reason: "duplicate of another call" });
  low = (await c.sites.findOne({ _id: "g-pin-low" }))!;
  assert(low.priority < 0 && low.scoreParts!.some((p) => p.name === "pushed down by a coordinator"));
  await say(U.c1, "correction", { action: "edit", recordType: "site", recordId: "g-pin-low", fields: { pin: null }, reason: "cleared" });
  low = (await c.sites.findOne({ _id: "g-pin-low" }))!;
  assert.equal(low.pin, undefined); assert(!low.scoreParts!.some((p) => /coordinator/.test(p.name)));
  ok("T7 the pin survives the waiting recount, push down goes last, null removes it");

  // T19: a new report on a silent-zone site keeps the +30 (satellite terms only ever raise a score).
  const sz = scored({ support: 1, waitingSince: now, silentZone: true }, now);
  await c.sites.insertOne(site("g-silent", { address: "Sessiz Sokak 4", coords: [38.9, 38.9], ...sz }));
  await say(U.vOn2, "report", { kind: "trapped", text: "Sessiz Sokak 4, iki kişi", textEn: "Sessiz Sokak 4, two people", address: "Sessiz Sokak 4", coords: [38.9, 38.9], region: R, peopleCount: 2 });
  const silent = (await c.sites.findOne({ _id: "g-silent" }))!;
  assert(silent.history.some((h) => /trapped \(2 people\)/.test(h.reason)), "the report merged into the site");
  assert.equal(silent.peopleTrapped, 2);
  assert(silent.scoreParts!.some((p) => p.name === "silent zone"), "the satellite term is still there");
  ok("T19 a merged report keeps the silent-zone term (it used to drop it)");
}

async function lifecycles() {
  const c = await cols();
  const now = new Date();

  // T12: a supplier without a vehicle is never picked for a delivery, even with the stock and closer.
  const need: Need = {
    _id: "g-blankets", item: "blankets", quantity: 20, region: R, siteIds: [], status: "open", history: [{ ts: now, by: U.field, source: "person", reason: "asked" }],
    deskId: DESK, confidence: "confirmed", lifeThreatening: false, lines: [{ quantity: 20 }], tier: 1, support: 1, requestedBy: [U.field],
    ...scored({ support: 1, waitingSince: now }, now),
  };
  await c.needs.insertOne(need);
  await tick(new Date(), { deskId: DESK });
  const deliver = (await c.tasks.findOne({ recordId: "g-blankets", type: "deliver", open: true }))!;
  assert.equal(deliver.assignee, U.supTruck, "the far supplier with a truck, not the near one on foot");
  ok("T12 a delivery needs stock and a vehicle");

  // T9: the truck reports a blocked road and cannot go on. Nobody else can take it (escalated). It clears: the truck carries on.
  await say(U.supTruck, "answer", { taskId: deliver._id, result: "accepted", etaMinutes: 40 });
  await say(U.supTruck, "incident", { kind: "road_blocked", text: "yol kapalı", textEn: "the road is closed", taskId: deliver._id, canContinue: false });
  let orig = (await c.tasks.findOne({ _id: deliver._id }))!;
  assert.equal(orig.status, "blocked");
  const rep = (await c.tasks.findOne({ replaces: deliver._id }))!;
  assert.equal(rep.status, "escalated", "no other supplier has a vehicle");
  const inc = (await c.incidents.findOne({ taskId: deliver._id }))!;
  await say(U.supTruck, "incident", { incidentId: inc._id, kind: "road_blocked", text: "açıldı", textEn: "cleared, moving again", canContinue: true, resolved: true });
  orig = (await c.tasks.findOne({ _id: deliver._id }))!;
  assert.equal(orig.status, "accepted"); assert.equal(orig.open, true); assert.equal(orig.assignee, U.supTruck);
  assert.equal((await c.tasks.findOne({ _id: rep._id }))!.status, "cancelled", "the replacement nobody took is closed");
  assert.equal((await c.needs.findOne({ _id: "g-blankets" }))!.status, "on_the_way");
  assert((await unread(U.supTruck)).some((i) => /^Carry on/.test(i.message)));
  ok("T9 blocked → accepted: the problem is over and nobody took over, the same person carries on, the need is on the way again");

  // T11 + T9: a shift ends. Every open task of the person goes on, with the note. When it is over the originals close.
  await c.sites.insertMany([site("g-hand-1", { coords: [38.7, 38.7] }), site("g-hand-2", { coords: [38.7, 38.71] })]);
  // Earlier timers may have handed vHand someone else's task: start this scene with only these two.
  await c.tasks.updateMany({ deskId: DESK, assignee: U.vHand, open: true }, { $set: { status: "cancelled", open: false } });
  const h1 = task("g-hand-1", { assignee: U.vHand, status: "accepted" });
  const h2 = task("g-hand-2", { assignee: U.vHand, status: "assigned", deadline: min(now, 30) });
  await c.tasks.insertMany([h1, h2]);
  await say(U.vHand, "incident", { kind: "handover", text: "vardiyam bitti", textEn: "my shift ends, the family at g-hand-1 speaks Kurdish", taskId: h1._id, canContinue: false });
  for (const h of [h1, h2]) {
    assert.equal((await c.tasks.findOne({ _id: h._id }))!.status, "blocked", `${h.recordId} blocked`);
    const next = (await c.tasks.findOne({ replaces: h._id }))!;
    assert(next && next.assignee && next.assignee !== U.vHand, `${h.recordId} went to someone else`);
    assert.match(next.detail, /Handover note from check-gap-vol-shift-ends: my shift ends, the family at g-hand-1 speaks Kurdish/);
  }
  ok("T11 handover: every open task of the person goes to the next person, with the note");
  const card = { kind: "incident" as const, incidentId: (await c.incidents.findOne({ taskId: h1._id }))!._id };
  assert.equal((await c.incidents.findOne({ _id: card.incidentId }))!.status, "helping");
  assert.equal((await c.inbox.countDocuments({ userId: U.c1, ...card })), 0, "solved and not critical: no card");
  const roadInc = { kind: "incident" as const, incidentId: inc._id };
  assert.equal((await c.inbox.countDocuments({ userId: U.c1, ...roadInc })), 1, "the road one could not be solved (nobody took over): a card");
  ok("T13 a coordinator card only for critical or unsolved incidents");
  const hinc = (await c.incidents.findOne({ taskId: h1._id }))!;
  await say(U.vHand, "incident", { incidentId: hinc._id, kind: "handover", text: "tamam", textEn: "done for today", canContinue: true, resolved: true });
  for (const h of [h1, h2]) assert.equal((await c.tasks.findOne({ _id: h._id }))!.status, "cancelled", "a replacement took over");
  ok("T9 blocked → cancelled: a replacement took over");

  // T10: an escalated task, a coordinator names who takes it.
  await c.sites.insertOne(site("g-esc", { coords: [38.2, 38.2], callStatus: "not_called" }));
  const esc = task("g-esc", { status: "escalated", tried: [U.vOff], history: [] });
  delete esc.assignee;
  await c.tasks.insertOne(esc);
  let ev = await say(U.c1, "approval", { taskId: esc._id, approved: true });
  assert.equal(ev.status, "rejected"); assert.match(ev.result!.reason, /name the person/);
  ev = await say(U.c1, "approval", { taskId: esc._id, approved: true, assignee: U.vOn2 });
  const picked = (await c.tasks.findOne({ _id: esc._id }))!;
  assert.equal(picked.status, "assigned"); assert.equal(picked.assignee, U.vOn2);
  assert((await unread(U.vOn2, { taskId: esc._id, kind: "task" })).length === 1);
  ok("T10 escalated → assigned: a coordinator picks someone, an approval without a name is refused");

  // T8: a new report changes a site someone is already working: they hear it, the reporter does not.
  await c.sites.insertOne(site("g-work", { address: "Is Sokak 9", coords: [38.3, 38.3], peopleTrapped: 1 }));
  const work = task("g-work", { type: "rescue", assignee: U.field, status: "accepted" });
  await c.tasks.insertOne(work);
  await say(U.vOn2, "report", { kind: "trapped", text: "Is Sokak 9, üç kişi", textEn: "Is Sokak 9, three people", address: "Is Sokak 9", coords: [38.3, 38.3], region: R, peopleCount: 3 });
  const told = await unread(U.field, { key: { $regex: "^site:g-work:" } });
  assert.equal(told.length, 1); assert.match(told[0].message, /Update on .*: 3 trapped now/);
  assert.equal((await unread(U.vOn2, { key: { $regex: "^site:g-work:" } })).length, 0);
  ok("T8 a site update reaches the people working it");
}

async function rules() {
  const c = await cols();

  // T14: comfort is tier 2, water stays tier 1, danger to life is tier 0.
  const meals = await say(U.field, "need", { item: "hot meals", quantity: 30, lifeThreatening: false, region: "gap-tiers" });
  const water = await say(U.field, "need", { item: "water", quantity: 30, lifeThreatening: false, region: "gap-tiers" });
  assert.equal((await c.needs.findOne({ _id: meals.result!.recordIds[0] }))!.tier, 2);
  assert.equal((await c.needs.findOne({ _id: water.result!.recordIds[0] }))!.tier, 1);
  ok("T14 hot meals are tier 2 (comfort), water stays tier 1");

  // T17: a citizen says danger to life. The delivery goes out at once and a volunteer gets a call to verify.
  const life = await say(U.pub2, "need", { item: "insulin", quantity: 2, lifeThreatening: true, region: R });
  const lifeId = life.result!.recordIds[0];
  const lifeNeed = (await c.needs.findOne({ _id: lifeId }))!;
  assert.equal(lifeNeed.status, "open", "danger to life never waits"); assert.equal(lifeNeed.confidence, "unconfirmed");
  const verify = (await c.tasks.findOne({ recordId: lifeId, type: "call", open: true }))!;
  assert(verify?.assignee, "a volunteer has the call");
  assert.match(verify.title, /Call to verify/);
  await say(verify.assignee!, "answer", { taskId: verify._id, result: "done", note: "spoke to the family" });
  assert.equal((await c.needs.findOne({ _id: lifeId }))!.confidence, "confirmed");
  ok("T17 danger to life from a citizen: open at once, a volunteer calls to verify, the call confirms it");

  // T16: a citizen cannot retract a site or someone else's need, but can withdraw a need only they asked for.
  await c.sites.insertOne(site("g-retract", { coords: [38.1, 38.1] }));
  let ev = await say(U.pub3, "correction", { action: "retract", recordType: "site", recordId: "g-retract", reason: "I think it's fake" });
  assert.equal(ev.status, "rejected"); assert.match(ev.result!.reason, /not vetted/);
  assert.equal((await c.sites.findOne({ _id: "g-retract" }))!.status, "open");
  ev = await say(U.pub3, "correction", { action: "retract", recordType: "need", recordId: lifeId, reason: "not needed" });
  assert.equal(ev.status, "rejected");
  ev = await say(U.pub2, "correction", { action: "retract", recordType: "need", recordId: lifeId, reason: "we got it from a neighbour" });
  assert.equal(ev.status, "merged", ev.result?.reason);
  assert.equal((await c.needs.findOne({ _id: lifeId }))!.status, "cancelled");
  ev = await say(U.vOn, "correction", { action: "retract", recordType: "site", recordId: "g-retract", reason: "duplicate of g-work, checked by phone" });
  assert.equal(ev.status, "merged", ev.result?.reason);
  ok("T16 a citizen cannot retract a site or another person's need, can withdraw their own, a volunteer can retract");

  // T15: three different public posts corroborate a closure. Two trusted sources disagreeing within 10 min: a field team is asked.
  const closure = (state: string, text: string) => ({ road: "Gap ring road", state, reason: text, coords: [38.404, 38.4] });
  await say("x-agent", "closure", closure("closed", "crash at the junction"), "x");
  await say("x-agent", "closure", closure("closed", "two cars blocking the ring road"), "x");
  let road = (await c.roads.findOne({ deskId: DESK, road: "Gap ring road" }))!;
  assert.equal(road.confidence, "unconfirmed");
  await say("x-agent", "closure", closure("closed", "ring road shut, police there"), "x");
  road = (await c.roads.findOne({ _id: road._id }))!;
  assert.equal(road.confidence, "corroborated");
  ok("T15 three different public posts about a closed road make it corroborated");

  await say(U.field2, "closure", closure("closed", "debris, confirmed on site"));
  await say(U.vOn, "closure", closure("open", "just drove through, it is open"));
  road = (await c.roads.findOne({ _id: road._id }))!;
  assert(road.history.some((h) => /two trusted sources disagree/.test(h.reason)));
  const asked = await c.inbox.find({ key: { $regex: `^road-clash:${road._id}:` } }).toArray();
  assert.equal(asked.length, 1, "one person asked");
  assert.match(asked[0].message, /Two trusted reports disagree about Gap ring road/);
  ok("T15 two trusted sources disagree about a road within 10 min: the nearest free field team is asked to check");
}

async function offlineIsNotNo() {
  const c = await cols();
  // T4 with #38 (a timeout is not a no): going offline is a miss. Seen again, they get the task back.
  await c.sites.insertOne(site("g-again", { coords: [37.9, 37.9], callStatus: "not_called" }));
  const said = (by: string) => ({ ts: new Date(), by, source: "person" as const, reason: "declined" });
  const t = task("g-again", { assignee: U.vGone, tried: [U.vOn, U.vOn2], history: [said(U.vOn), said(U.vOn2)], deadline: min(new Date(), 30) });
  await c.tasks.insertOne(t);
  await tick(new Date(), { deskId: DESK });
  let now = (await c.tasks.findOne({ _id: t._id }))!;
  assert.equal(now.status, "escalated", "offline is the third miss");
  await c.users.updateOne({ _id: U.vGone }, { $set: { lastSeen: new Date(Date.now() + 24 * 3600_000) } });
  await tick(new Date(Date.now() + 60_000), { deskId: DESK });
  now = (await c.tasks.findOne({ _id: t._id }))!;
  assert.equal(now.status, "assigned"); assert.equal(now.assignee, U.vGone, "back to the nearest, who is around again");
  ok("T4 + #38 going offline is a miss, not a no: seen again, the person gets the task back");
}

async function main() {
  await cleanup();
  const c = await cols();
  await c.users.insertMany(people(new Date()));
  await sweeperRows();
  await pins();
  await lifecycles();
  await rules();
  await offlineIsNotNo();
  console.log(`\nAll ${passed} checks passed.`);
}

main()
  .catch((err) => { console.error("\nFAILED:", err instanceof Error ? err.stack ?? err.message : err); process.exitCode = 1; })
  .finally(async () => { await cleanup().catch(() => {}); await closeDb(); });
