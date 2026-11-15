// Check for the dispatcher gaps (group C): npm run dispatch:check
// Notices to the people who asked, stock that covers the quantity, the complete risk rule (big
// supply moves, evacuation plans), the person a coordinator names, closing the other approval
// items, and no second proposal of a rejected rescue. Throwaway desk "check-dispatch" with its own
// people; the real desk and the seeded people are never touched. Events go in already "working"
// (like handlers-check), so a Brain running on the same cluster cannot take them.
import assert from "node:assert/strict";
import { processEvent } from "../workers/brain";
import { BIG_SUPPLY_MOVE, react } from "../workers/dispatcher";
import { closeDb, cols, newId } from "./db";
import { scored } from "./rules/priority";
import type { Event, EventType, InboxItem, Site, Source, Task, User, Zone } from "./types";

const DESK = "check-dispatch";
const R = "check-region";
let passed = 0;
const ok = (msg: string) => { passed++; console.log(`ok  ${msg}`); };

const U = {
  a1: "check-d-asker-1", a2: "check-d-asker-2", a3: "check-d-asker-3",
  blA: "check-d-sup-12", blB: "check-d-sup-5", matS1: "check-d-sup-mat-8", matS2: "check-d-sup-mat-25",
  waC: "check-d-sup-water-1", waD: "check-d-sup-water-2", cots: "check-d-sup-cots", cotsNone: "check-d-sup-nothing",
  field: "check-d-field", fieldOff: "check-d-field-offline", c1: "check-d-coord-1", c2: "check-d-coord-2",
};
const people = (): User[] => {
  const base = { region: R, status: "available" as const, deskId: DESK, lastSeen: new Date() };
  const sup = (id: string, stock: Record<string, number>): User => ({ ...base, _id: id, name: id, role: "supplier", trust: "vetted", profile: { stock, vehicle: "truck" } });
  return [
    ...[U.a1, U.a2, U.a3].map((id): User => ({ ...base, _id: id, name: id, role: "public", trust: "vetted" })),
    sup(U.blA, { Blankets: 12 }), sup(U.blB, { blankets: 5 }), sup(U.matS1, { mats: 8 }), sup(U.matS2, { mats: 25 }),
    sup(U.waC, { water: 50 }), sup(U.waD, { water: 50 }), sup(U.cots, { cots: 200 }), sup(U.cotsNone, {}),
    { ...base, _id: U.field, name: "Field", role: "field", trust: "vetted" },
    { ...base, _id: U.fieldOff, name: "Field offline", role: "field", trust: "vetted", status: "offline" },
    { ...base, _id: U.c1, name: "Coordinator 1", role: "coordinator", trust: "official" },
    { ...base, _id: U.c2, name: "Coordinator 2", role: "coordinator", trust: "official" },
  ];
};

const queued: Event[] = [];
let n = 0;
async function send<P>(type: EventType, source: Source, actor: string, payload: P) {
  const { events } = await cols();
  const now = new Date();
  const doc: Event = {
    _id: newId(), deskId: DESK, ts: now, observedAt: now, type, source, actor,
    lane: source === "person" || source === "system" ? 0 : 1, payload,
    status: "working", lockedAt: now, attempts: 1, dedupeKey: `check:dispatch:${Date.now()}:${n++}`,
  };
  await events.insertOne(doc);
  queued.push(doc);
  while (queued.length) await processEvent(queued.shift()!);
  return (await events.findOne({ _id: doc._id }))!;
}
async function again(id: string) {
  const ev = (await (await cols()).events.findOne({ _id: id }))!;
  await processEvent({ ...ev, status: "working" });
}
const need = (actor: string, item: string, quantity: number, extra: object = {}) =>
  send("need", "person", actor, { item, quantity, lifeThreatening: false, region: R, ...extra });
const answer = (actor: string, taskId: string, result: string, extra: object = {}) => send("answer", "person", actor, { taskId, result, ...extra });
const approval = (actor: string, taskId: string, approved: boolean, assignee?: string) =>
  send("approval", "person", actor, { taskId, approved, ...(assignee ? { assignee } : {}) });

async function taskFor(recordId: string, type: Task["type"], open = true) {
  return (await (await cols()).tasks.find({ recordId, type, ...(open ? { open: true } : {}) }).sort({ _id: -1 }).toArray())[0];
}
const taskById = async (id: string) => (await (await cols()).tasks.findOne({ _id: id }))!;
const inboxOf = async (userId: string, kind?: InboxItem["kind"]) =>
  (await (await cols()).inbox.find({ userId, ...(kind ? { kind } : {}) }).toArray());
const noticesOf = async (userId: string) => (await inboxOf(userId, "notice")).map((i) => i.message);
const needOf = async (id: string) => (await (await cols()).needs.findOne({ _id: id }))!;

async function cleanup() {
  const c = await cols();
  await c.inbox.deleteMany({ userId: { $in: Object.values(U) } });
  await Promise.all([
    c.events.deleteMany({ deskId: DESK }), c.sites.deleteMany({ deskId: DESK }), c.needs.deleteMany({ deskId: DESK }),
    c.zones.deleteMany({ deskId: DESK }), c.incidents.deleteMany({ deskId: DESK }), c.tasks.deleteMany({ deskId: DESK }),
    c.users.deleteMany({ deskId: DESK }), c.meta.deleteMany({ _id: { $in: [`cases:${DESK}`, `version:${DESK}`] } }),
  ]);
}

function mkSite(id: string, trapped: number): Site {
  const now = new Date();
  return {
    _id: id, address: `${id} street`, region: R, peopleTrapped: trapped, callStatus: "verified", status: "open", sources: [],
    history: [], deskId: DESK, confidence: "confirmed", observedAt: now, tier: 0, support: 1, caseNo: 57,
    ...scored({ support: 1, waitingSince: now }, now),
  };
}
const touch = (siteId: string) => react([{ recordType: "site", recordId: siteId, op: "updated", eventId: newId(), fields: ["peopleTrapped"] }]);

async function main() {
  await cleanup();
  const c = await cols();
  await c.users.insertMany(people());

  // ---------- 2. stock must cover the quantity ----------
  const enough = await need(U.a1, "mats", 20);
  const matNeed = enough.result!.recordIds[0];
  const t0 = await taskFor(matNeed, "deliver");
  assert.equal(t0.assignee, U.matS2, "only the supplier with 25 has enough");
  assert(!/has \d+ of/.test(t0.detail + t0.history.map((h) => h.reason).join()), "no shortage note when stock covers it");
  ok("deliver goes to the supplier whose stock covers the quantity (25 for 20, not 8)");

  const short = await need(U.a1, "blankets", 30);
  const blNeed = short.result!.recordIds[0];
  const t1 = await taskFor(blNeed, "deliver");
  assert.equal(t1.status, "assigned"); assert.equal(t1.assignee, U.blA, "the one with the most stock (12)");
  assert.match(t1.detail, /Supplier has 12 of 30\./);
  assert(t1.history.some((h) => /has 12 of 30/.test(h.reason)), "history says it");
  ok("nobody has 30: the one with the most (12) gets it, detail and history say 'has 12 of 30'");

  const nothing = await need(U.a1, "tents", 5);
  const t2 = await taskFor(nothing.result!.recordIds[0], "deliver");
  assert.equal(t2.status, "escalated");
  assert((await inboxOf(U.c1, "notice")).some((i) => i.taskId === t2._id), "coordinators told");
  ok("nobody has any: escalated as before");

  // ---------- 1. the people who asked hear when their need moves ----------
  assert((await noticesOf(U.a1)).some((m) => /^Blankets for check-region: a supplier has been found$/.test(m)), (await noticesOf(U.a1)).join("|"));
  await need(U.a2, "blankets", 30); // a second voice joins the same need
  assert.deepEqual((await needOf(blNeed)).requestedBy, [U.a1, U.a2]);
  const acc = await answer(U.blA, t1._id, "accepted", { etaMinutes: 60 });
  assert.equal(acc.status, "done", acc.result?.reason);
  for (const u of [U.a1, U.a2]) {
    const m = (await noticesOf(u)).filter((x) => /on the way/.test(x));
    assert.deepEqual(m, ["Blankets for check-region: on the way, about 1 h"], `${u}: ${m}`);
  }
  await again(acc._id!);
  assert.equal((await noticesOf(U.a1)).filter((x) => /on the way/.test(x)).length, 1, "a re-run adds nothing");
  const dn = await answer(U.blA, t1._id, "done");
  for (const u of [U.a1, U.a2]) assert.equal((await noticesOf(u)).filter((x) => /delivered$/.test(x)).length, 1);
  await again(dn._id!);
  assert.equal((await noticesOf(U.a2)).filter((x) => /delivered$/.test(x)).length, 1);
  assert.equal((await needOf(blNeed)).status, "delivered");
  ok("assigned, on the way (about 1 h) and delivered: one notice per asker per change, a re-run adds nothing");

  const water = await need(U.a3, "water", 20);
  const waNeed = water.result!.recordIds[0];
  const w1 = await taskFor(waNeed, "deliver");
  await answer(w1.assignee!, w1._id, "accepted");
  const inc = await send("incident", "person", w1.assignee!, {
    kind: "vehicle_breakdown", text: "broke down", textEn: "broke down", taskId: w1._id, canContinue: false,
  });
  assert.equal(inc.status, "done", inc.result?.reason);
  const msgs = await noticesOf(U.a3);
  assert(msgs.some((m) => /delayed, a new supplier is being found/.test(m)), msgs.join("|"));
  assert.equal(msgs.filter((m) => /delayed/.test(m)).length, 1);
  assert.equal(msgs.filter((m) => /a supplier has been found/.test(m)).length, 2, "the replacement is announced too");
  await again(inc._id!);
  assert.equal((await noticesOf(U.a3)).filter((m) => /delayed/.test(m)).length, 1, "re-run: still one");
  ok("a failed delivery sends 'delayed, a new supplier is being found' once");

  // ---------- 3a. a big supply move needs a coordinator ----------
  assert.equal(BIG_SUPPLY_MOVE, 100);
  const cotsEv = await need(U.a1, "cots", BIG_SUPPLY_MOVE);
  const cotsNeed = cotsEv.result!.recordIds[0];
  const big = await taskFor(cotsNeed, "deliver");
  assert.equal(big.status, "waiting_approval"); assert.equal(big.risk, "high");
  assert.match(big.detail, new RegExp(`Proposed team: .*\\(${U.cots}\\)`));
  for (const u of [U.c1, U.c2]) assert((await inboxOf(u, "approval")).some((i) => i.taskId === big._id && i.status === "unread"));
  assert.equal((await needOf(cotsNeed)).status, "open", "nothing assigned yet");
  const small = await need(U.a1, "cots", 40, { region: "elsewhere" });
  assert.equal((await taskFor(small.result!.recordIds[0], "deliver")).status, "assigned", "below the limit stays low risk");
  ok("a deliver of 100 or more waits for approval with an item for every coordinator; 40 goes straight out");

  // ---------- 4 + 5. the person a coordinator names, and closing the other approval items ----------
  const refused = [
    [U.cotsNone, /no cots in stock/], [U.field, /wrong role/], ["check-d-nobody", /not on the desk/],
  ] as const;
  for (const [who, why] of refused) {
    const ev = await approval(U.c1, big._id, true, who);
    // check-d-nobody is rejected by the keeper itself (not on the desk), the rest by the dispatcher
    if (who === "check-d-nobody") assert.equal(ev.status, "rejected");
    assert.equal((await taskById(big._id)).status, "waiting_approval", `${who} must not get it`);
    if (who !== "check-d-nobody") {
      assert((await noticesOf(U.c1)).some((m) => why.test(m) && m.includes(who)), (await noticesOf(U.c1)).join("|"));
      await again(ev._id!);
    }
  }
  assert.equal((await noticesOf(U.c1)).filter((m) => /wrong role/.test(m)).length, 1, `a re-run sends the notice once: ${(await noticesOf(U.c1)).join(" | ")}`);
  assert.equal((await taskById(big._id)).assignee, undefined);
  assert((await inboxOf(U.c2, "approval")).every((i) => i.status === "unread"), "refused approval decides nothing");
  ok("approval naming someone with no stock or the wrong role: task keeps waiting, the coordinator is told why, once");

  // a rescue, to test role and offline
  await c.sites.insertOne(mkSite("d-site", 2));
  await touch("d-site");
  const resc = await taskFor("d-site", "rescue");
  assert.equal(resc.status, "waiting_approval"); assert.equal(resc.risk, "high");
  await approval(U.c1, resc._id, true, U.blA);
  assert((await noticesOf(U.c1)).some((m) => m.includes(`${U.blA} cannot take a rescue task: wrong role`)), (await noticesOf(U.c1)).join("|"));
  await approval(U.c1, resc._id, true, U.fieldOff);
  assert((await noticesOf(U.c1)).some((m) => /check-d-field-offline cannot take a rescue task: offline/.test(m)));
  assert.equal((await taskById(resc._id)).status, "waiting_approval");
  ok("rescue: a supplier ('wrong role') and an offline field person are refused");

  const okEv = await approval(U.c1, big._id, true, U.cots);
  assert.equal(okEv.status, "done", okEv.result?.reason);
  const bt = await taskById(big._id);
  assert.equal(bt.status, "assigned"); assert.equal(bt.assignee, U.cots);
  assert.equal((await needOf(cotsNeed)).status, "assigned");
  assert((await noticesOf(U.a1)).some((m) => /Cots for check-region: a supplier has been found/.test(m)));
  assert((await inboxOf(U.c2, "approval")).filter((i) => i.taskId === big._id).every((i) => i.status === "read"), "the other coordinator's item is read");
  assert((await inboxOf(U.c1, "approval")).filter((i) => i.taskId === big._id).every((i) => i.status === "read"));
  const hl = bt.history.length;
  await again(okEv._id!);
  assert.equal((await taskById(big._id)).history.length, hl, "a re-run changes nothing");
  assert((await inboxOf(U.cots, "task")).filter((i) => i.taskId === big._id).length === 1);
  ok("a valid approval assigns, tells the askers, and marks every coordinator's approval item read");

  // ---------- 6. a rejected rescue is not proposed again unless something is new ----------
  const rej = await approval(U.c2, resc._id, false);
  assert.equal(rej.status, "done", rej.result?.reason);
  const rejected = await taskById(resc._id);
  assert.equal(rejected.status, "cancelled");
  assert((await inboxOf(U.c1, "approval")).filter((i) => i.taskId === resc._id).every((i) => i.status === "read"), "rejection closes the others' items");
  assert.match(rejected.history.at(-1)!.reason, /rejected by the coordinator, 2 trapped/);
  await touch("d-site"); await touch("d-site");
  assert.equal(await taskFor("d-site", "rescue"), undefined, "nothing new: no new proposal");
  const after = await taskById(resc._id);
  assert.equal(after.history.filter((h) => /not proposed again/.test(h.reason)).length, 1, "the reason is in the history, once");
  ok("rejected rescue: not proposed again after a re-run or an unrelated change; reason recorded once");

  await c.sites.updateOne({ _id: "d-site" }, { $set: { peopleTrapped: 3 } });
  await touch("d-site");
  const resc2 = await taskFor("d-site", "rescue");
  assert(resc2 && resc2._id !== resc._id && resc2.status === "waiting_approval");
  assert(resc2.history.some((h) => /3 trapped now, 2 then/.test(h.reason)), resc2.history.map((h) => h.reason).join("|"));
  ok("more people trapped than at the rejection: proposed again, with the reason");

  await approval(U.c1, resc2._id, false);
  await touch("d-site");
  assert.equal(await taskFor("d-site", "rescue"), undefined);
  await new Promise((r) => setTimeout(r, 20));
  const report = await send("report", "person", U.c1, { kind: "site_update", text: "still there", textEn: "still there" });
  await c.sites.updateOne({ _id: "d-site" }, { $push: { sources: { source: "person" as const, eventId: report._id! } } });
  await touch("d-site");
  const resc3 = await taskFor("d-site", "rescue");
  assert(resc3 && resc3.history.some((h) => /confirmed report arrived/.test(h.reason)));
  ok("a confirmed (official) report after the rejection: proposed again");

  // ---------- 3b. evacuation plans ----------
  const zone = (id: string, name: string): Zone => ({ _id: id, name, silentZone: false, damage: 0, dark: false, calls: 0, deskId: DESK, region: R });
  await c.zones.insertMany([zone("d-zone-a", "Zone A"), zone("d-zone-b", "Zone B")]);
  const bad = await send("plan", "person", U.c1, { zoneExits: [{ zoneId: "d-zone-a", exit: "North" }], reason: "x" });
  assert.equal(bad.status, "rejected"); assert.match(bad.result!.reason, /not from a person/);
  const p1 = await send("plan", "system", "planner", {
    zoneExits: [{ zoneId: "d-zone-a", exit: "North road" }, { zoneId: "d-zone-b", exit: "Pier" }, { zoneId: "d-ghost", exit: "Hill" }],
    reason: "fire front moving east",
  });
  assert.equal(p1.status, "done", p1.result?.reason);
  const ev1 = (await c.tasks.find({ deskId: DESK, type: "evacuate" }).toArray());
  assert.equal(ev1.length, 1, "ONE task for the whole plan");
  const e1 = ev1[0];
  assert.equal(e1.status, "waiting_approval"); assert.equal(e1.risk, "high"); assert.equal(e1.recordType, "zone");
  for (const t of ["Zone A → North road", "Zone B → Pier", "D Ghost → Hill"]) assert(e1.detail.includes(t), e1.detail);
  for (const u of [U.c1, U.c2]) assert((await inboxOf(u, "approval")).some((i) => i.taskId === e1._id));
  assert.equal((await c.zones.findOne({ _id: "d-zone-a" }))!.exitAssigned, undefined, "nothing set before approval");
  assert((await c.zones.findOne({ _id: "d-zone-a" }))!.history!.some((h) => /evacuation plan proposed: exit North road/.test(h.reason)));
  await again(p1._id!);
  assert.equal((await c.tasks.find({ deskId: DESK, type: "evacuate" }).toArray()).length, 1, "re-run: still one task");
  assert.equal((await c.zones.findOne({ _id: "d-zone-a" }))!.history!.filter((h) => h.eventId === p1._id).length, 1, "re-run: one history line");
  ok("a plan makes ONE high-risk evacuate task listing every zone and exit, waiting for approval; re-run changes nothing");

  await new Promise((r) => setTimeout(r, 20));
  await send("plan", "system", "planner", { zoneExits: [{ zoneId: "d-zone-a", exit: "East gate" }], reason: "fire turned" });
  assert.equal((await taskById(e1._id)).status, "cancelled");
  assert((await taskById(e1._id)).history.some((h) => /newer evacuation plan/.test(h.reason)));
  assert((await inboxOf(U.c2, "approval")).filter((i) => i.taskId === e1._id).every((i) => i.status === "read"));
  const e2 = await taskFor("d-zone-a", "evacuate");
  assert(e2 && e2._id !== e1._id && e2.status === "waiting_approval");
  const stale = await approval(U.c1, e1._id, true);
  assert.equal(stale.status, "rejected", "the stale plan cannot be approved");
  assert.equal((await c.zones.findOne({ _id: "d-zone-a" }))!.exitAssigned, undefined);
  ok("a newer plan cancels the older waiting task; the stale plan cannot be approved");

  const yes = await approval(U.c1, e2._id, true);
  assert.equal(yes.status, "done", yes.result?.reason);
  const za = (await c.zones.findOne({ _id: "d-zone-a" }))!;
  assert.equal(za.exitAssigned, "East gate");
  assert(za.history!.some((h) => /evacuation exit set to East gate/.test(h.reason)));
  assert.equal((await c.zones.findOne({ _id: "d-zone-b" }))!.exitAssigned, undefined, "the cancelled plan set nothing on B");
  const done = await taskById(e2._id);
  assert.equal(done.status, "done"); assert.equal(done.open, false); assert.equal(done.assignee, undefined);
  const zl = za.history!.length;
  await again(yes._id!);
  assert.equal((await c.zones.findOne({ _id: "d-zone-a" }))!.history!.length, zl, "re-run changes nothing");
  ok("approving a plan sets each zone's exit with history and finishes the task, no field team");

  await send("plan", "system", "planner", { zoneExits: [{ zoneId: "d-zone-b", exit: "Pier" }], reason: "flood" });
  const e3 = await taskFor("d-zone-b", "evacuate");
  assert.equal((await approval(U.c1, e3._id, false)).status, "done");
  assert.equal((await taskById(e3._id)).status, "cancelled");
  assert.equal((await c.zones.findOne({ _id: "d-zone-b" }))!.exitAssigned, undefined);
  ok("rejecting a plan changes nothing on the zones");

  // --- a stuck task: a coordinator gives it to a named person ---
  await need(U.a3, "mats", 4);
  const st = await taskFor((await c.needs.findOne({ deskId: DESK, item: "mats", status: { $ne: "cancelled" } }, { sort: { _id: -1 } }))!._id, "deliver");
  await c.tasks.updateOne({ _id: st._id }, { $set: { status: "escalated" }, $unset: { assignee: "" } });
  assert.equal((await approval(U.c1, st._id, true)).status === "done", false, "escalated without a person: refused");
  assert.equal((await taskById(st._id)).status, "escalated");
  const given = await approval(U.c1, st._id, true, U.matS2);
  assert.equal(given.status, "done");
  const st2 = await taskById(st._id);
  assert.equal(st2.status, "assigned"); assert.equal(st2.assignee, U.matS2);
  assert(st2.history.some((h) => h.reason.startsWith(`assigned by ${U.c1}`)));
  assert((await inboxOf(U.matS2, "task")).some((i) => i.taskId === st._id));
  ok("a coordinator gives a stuck (escalated) task to a named person: assigned, inbox item sent; without a name it is refused");

  console.log(`\n${passed} checks passed`);
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(async () => { await cleanup().catch((e) => console.error("cleanup failed", e)); await closeDb(); });
