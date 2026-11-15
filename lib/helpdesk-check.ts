// Check for the help desk (group D): npm run helpdesk:check
// Final system design §6 and §8.6. A truck breaks down: relay or fresh delivery (the closer one),
// an assist task for the mechanic, notices with a new ETA, the coordinators' card with every
// step, one action line per step, then resolved frees the person. Plus short_supply, road_blocked,
// cannot_find (twice), injury and other. Throwaway desk "check-helpdesk" with its own people; the
// real desk is never touched. Events go in already "working" so a Brain on the same cluster cannot
// take them.
import assert from "node:assert/strict";
import { processEvent } from "../workers/brain";
import { closeDb, cols, newId } from "./db";
import { scored } from "./rules/priority";
import type { Event, EventType, InboxItem, LatLng, Site, Source, Task, User } from "./types";

const DESK = "check-helpdesk";
const R = "check-region";
let passed = 0;
const ok = (msg: string) => { passed++; console.log(`ok  ${msg}`); };

const U = {
  ask: "check-h-asker", ask2: "check-h-asker-2",
  drv1: "check-h-driver-1", drv2: "check-h-driver-2", drv3: "check-h-driver-3", sup2: "check-h-supplier-2",
  van: "check-h-vol-van", mech: "check-h-vol-mechanic", field: "check-h-field-waiting",
  c1: "check-h-coord-1", c2: "check-h-coord-2",
  supS1: "check-h-short-1", supS2: "check-h-short-2", rep: "check-h-reporter",
  cf1: "check-h-cf-1", cf2: "check-h-cf-2", cf3: "check-h-cf-3",
  fieldU: "check-h-field-hurt", volU: "check-h-vol-at-site", aid: "check-h-vol-first-aid",
  oth: "check-h-other",
};
const SITE: LatLng = [37.5, 38.0];
const TRUCK: LatLng = [37.5, 38.02];      // km 14: about 1.8 km from the site
const CLOSE_TO_TRUCK: LatLng = [37.5, 38.025];
const FAR: LatLng = [37.5, 38.3];
const NEAR_SITE: LatLng = [37.5, 38.001];
const AWAY: LatLng = [37.5, 37.9];

const people = (): User[] => {
  const base = { region: R, status: "available" as const, deskId: DESK, lastSeen: new Date() };
  const mk = (id: string, role: User["role"], more: Partial<User> = {}): User => ({ ...base, _id: id, name: id, role, trust: "vetted", ...more });
  const sup = (id: string, stock: Record<string, number>, more: Partial<User> = {}) => mk(id, "supplier", { profile: { stock, vehicle: "truck" }, ...more });
  return [
    mk(U.ask, "public"), mk(U.ask2, "public"),
    sup(U.drv1, { blankets: 30 }, { coords: TRUCK }), sup(U.drv2, { water: 30 }, { coords: TRUCK }), sup(U.drv3, { tents: 10 }, { coords: TRUCK }),
    sup(U.sup2, { blankets: 50, water: 50 }, { coords: AWAY }),
    mk(U.van, "volunteer", { coords: CLOSE_TO_TRUCK, profile: { vehicle: "van" } }),
    mk(U.mech, "volunteer", { coords: TRUCK, profile: { skills: ["mechanic"], vehicle: "none" } }),
    mk(U.field, "field", { coords: SITE }),
    mk(U.c1, "coordinator", { trust: "official" }), mk(U.c2, "coordinator", { trust: "official" }),
    sup(U.supS1, { mats: 30 }, { coords: NEAR_SITE }), sup(U.supS2, { mats: 40 }, { coords: AWAY }),
    mk(U.rep, "volunteer"), mk(U.cf1, "volunteer"), mk(U.cf2, "volunteer"), mk(U.cf3, "volunteer"),
    mk(U.fieldU, "field"), mk(U.volU, "volunteer"), mk(U.aid, "volunteer", { profile: { skills: ["first_aid"] } }),
    mk(U.oth, "volunteer"),
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
    status: "working", lockedAt: now, attempts: 1, dedupeKey: `check:helpdesk:${Date.now()}:${n++}`,
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
const need = (actor: string, item: string, quantity: number, siteId?: string) =>
  send("need", "person", actor, { item, quantity, lifeThreatening: false, region: R, ...(siteId ? { siteId } : {}) });
const answer = (actor: string, taskId: string, result: string, extra: object = {}) => send("answer", "person", actor, { taskId, result, ...extra });
const incident = (actor: string, kind: string, textEn: string, taskId: string | undefined, canContinue: boolean, extra: object = {}) =>
  send("incident", "person", actor, { kind, text: textEn, textEn, canContinue, ...(taskId ? { taskId } : {}), ...extra });

const taskById = async (id: string) => (await (await cols()).tasks.findOne({ _id: id }))!;
const tasksFor = async (recordId: string, type: Task["type"]) => (await cols()).tasks.find({ recordId, type }).sort({ _id: 1 }).toArray();
const inboxOf = async (userId: string, kind?: InboxItem["kind"]) => (await (await cols()).inbox.find({ userId, ...(kind ? { kind } : {}) }).toArray());
const noticesOf = async (userId: string) => (await inboxOf(userId, "notice")).map((i) => i.message);
const userOf = async (id: string) => (await (await cols()).users.findOne({ _id: id }))!;
const incOf = async (id: string) => (await (await cols()).incidents.findOne({ _id: id }))!;
const counts = async () => {
  const c = await cols();
  return {
    tasks: await c.tasks.countDocuments({ deskId: DESK }), inbox: await c.inbox.countDocuments({ userId: { $in: Object.values(U) } }),
    actions: (await c.incidents.find({ deskId: DESK }).toArray()).reduce((a, i) => a + i.actions.length, 0),
    needs: await c.needs.countDocuments({ deskId: DESK }), roads: await c.roads.countDocuments({ deskId: DESK }),
  };
};

async function cleanup() {
  const c = await cols();
  await c.inbox.deleteMany({ userId: { $in: Object.values(U) } });
  await Promise.all([
    c.events.deleteMany({ deskId: DESK }), c.sites.deleteMany({ deskId: DESK }), c.needs.deleteMany({ deskId: DESK }),
    c.roads.deleteMany({ deskId: DESK }), c.incidents.deleteMany({ deskId: DESK }), c.tasks.deleteMany({ deskId: DESK }),
    c.users.deleteMany({ deskId: DESK }), c.meta.deleteMany({ _id: { $in: [`cases:${DESK}`, `version:${DESK}`] } }),
  ]);
}

function mkSite(id: string, caseNo: number, coords: LatLng): Site {
  const now = new Date();
  return {
    _id: id, address: `${id} street`, region: R, coords, peopleTrapped: 0, callStatus: "verified", status: "open", sources: [],
    history: [], deskId: DESK, confidence: "confirmed", observedAt: now, tier: 0, support: 1, caseNo,
    ...scored({ support: 1, waitingSince: now }, now),
  };
}
/** A task made by hand: somebody already has it. */
const fixture = (over: Partial<Task> & Pick<Task, "type" | "recordId" | "assignee">): Task => ({
  _id: newId(), recordType: "site", tried: [], risk: "low", tier: 1, priority: 50, status: "accepted", open: true,
  title: `fixture ${over.type}`, detail: "", deadline: new Date(Date.now() + 5 * 60_000), history: [], deskId: DESK, ...over,
});

/** The truck scenario: a deliver task accepted by `driver`, a field team waiting at the site, then the breakdown. */
async function breakdown(item: string, driver: string, siteId: string) {
  const c = await cols();
  const created = await need(U.ask, item, 30, siteId);
  const needId = created.result!.recordIds[0];
  const [t0] = await tasksFor(needId, "deliver");
  assert.equal(t0.assignee, driver, `the driver with ${item} gets the delivery`);
  await answer(driver, t0._id, "accepted", { etaMinutes: 40 });
  assert.equal((await c.needs.findOne({ _id: needId }))!.status, "on_the_way");
  const ev = await incident(driver, "vehicle_breakdown", "Flat tire at km 14, I cannot move", t0._id, false, { coords: TRUCK });
  assert.equal(ev.status, "done", ev.result?.reason);
  return { needId, t0, ev, incId: `inc-${ev._id}` };
}

async function main() {
  await cleanup();
  const c = await cols();
  await c.users.insertMany(people());
  await c.sites.insertMany([mkSite("site-h-57", 57, SITE), mkSite("site-h-61", 61, [37.5, 38.005])]);
  // A field team waits at the site for the blankets: a task of theirs touches the same site.
  await c.tasks.insertOne(fixture({ type: "rescue", recordId: "site-h-57", assignee: U.field, title: "Rescue at site 57" }));

  // ---------- 1. relay is closer ----------
  const s1 = await breakdown("blankets", U.drv1, "site-h-57");
  const inc1 = await incOf(s1.incId);
  const old1 = await taskById(s1.t0._id);
  assert.equal(old1.status, "blocked"); assert.equal(old1.open, false); assert.equal(old1.blockedBy, inc1._id);
  const [, relay] = await tasksFor(s1.needId, "deliver");
  assert(relay, "a replacement task");
  assert.equal(relay.replaces, old1._id); assert.equal(relay.assignee, U.van, "the nearest free vehicle");
  assert.equal(relay.type, "deliver"); assert.equal(relay.status, "assigned");
  assert.match(relay.detail, /Relay: pick up 30 blankets from the truck at 37\.5000, 38\.0200 \(Flat tire at km 14, I cannot move\), take them to site 57/);
  assert(relay.history.some((h) => /relay/.test(h.reason)), "history says relay");
  ok(`relay: the van (${U.van}) picks the load up at the truck and takes it to the site; the replacement carries replaces and says why`);

  const [assist1] = await tasksFor(inc1._id, "assist");
  assert(assist1, "an assist task"); assert.equal(assist1.recordType, "incident");
  assert.equal(assist1.assignee, U.mech, "the mechanic, not the van that already has the relay");
  assert.equal(assist1.risk, "low"); assert.equal(assist1.status, "assigned");
  assert.match(assist1.detail, /jack and a spare wheel/);
  ok("assist: the nearest free mechanic gets a low-risk task to bring a jack and a spare wheel");

  assert.equal((await c.needs.findOne({ _id: s1.needId }))!.status, "assigned", "the need is carried again");
  const eta = (await noticesOf(U.field)).filter((m) => /new ETA about \d+ min/.test(m));
  assert.equal(eta.length, 1, "the field team that waits gets the new ETA");
  assert.equal((await noticesOf(U.ask)).filter((m) => /new ETA about \d+ min/.test(m)).length, 1, "so does the person who asked");
  assert((await noticesOf(U.ask)).some((m) => /delayed, a new supplier is being found/.test(m)));
  assert((await inboxOf(U.drv1, "notice")).some((i) => /The desk is on it/.test(i.message)), "the driver hears what the desk did");
  ok("notices: the waiting field team and the asker get a new ETA in minutes, the driver hears what the desk did");

  const coordCard = (await inboxOf(U.c1, "incident")).filter((i) => i.incidentId === inc1._id);
  assert.equal(coordCard.length, 1);
  for (const re of [/vehicle breakdown/, /Flat tire/, /task \S+ blocked/, /replacement \S+ made \(relay/, /assist task \S+ sent to check-h-vol-mechanic/, /told the new ETA/]) {
    assert.match(coordCard[0].message, re);
  }
  assert.equal((await inboxOf(U.c2, "incident")).filter((i) => i.incidentId === inc1._id).length, 1);
  ok("the coordinators' card says what happened and each step the desk already did");

  const lines = inc1.actions.map((a) => a.what);
  assert.equal(new Set(lines).size, lines.length, "no line twice");
  for (const re of [/reported vehicle breakdown/, /marked busy/, /blocked/, /replacement .* \(relay/, /assist task .* sent to/, /told the new ETA/]) {
    assert(lines.some((l) => re.test(l)), `an action line for ${re}: ${lines.join(" | ")}`);
  }
  assert.equal(inc1.status, "helping"); assert.equal(inc1.severity, "high");
  assert.equal((await userOf(U.drv1)).status, "busy");
  ok(`incident.actions has one line per step (${lines.length} lines), status helping, the driver is busy`);

  const before = await counts();
  await again(s1.ev._id!);
  assert.deepEqual(await counts(), before, "a re-run changes nothing");
  assert.equal((await c.needs.findOne({ _id: s1.needId }))!.status, "assigned");
  assert.equal((await incOf(inc1._id)).status, "helping");
  ok("re-running the incident event changes nothing (no task, notice, line or need move)");

  const res = await incident(U.drv1, "vehicle_breakdown", "Tire changed, moving", s1.t0._id, true, { incidentId: inc1._id, resolved: true });
  assert.equal(res.status, "merged", res.result?.reason);
  assert.equal((await incOf(inc1._id)).status, "resolved");
  assert.equal((await userOf(U.drv1)).status, "available");
  const closed = await taskById(assist1._id);
  assert.equal(closed.open, false); assert.equal(closed.status, "cancelled");
  assert(closed.history.some((h) => /the problem is over/.test(h.reason)));
  assert((await noticesOf(U.mech)).some((m) => /Stop: .*The problem is over/.test(m)));
  assert((await incOf(inc1._id)).actions.some((a) => /available again/.test(a.what)));
  assert.equal((await taskById(relay._id)).open, true, "the relay is not touched");
  const after = await counts();
  await again(res._id!);
  assert.deepEqual(await counts(), after, "a second resolved changes nothing");
  ok("resolved: incident resolved, the driver is available, the assist task is closed with a note; a re-run changes nothing");

  // ---------- 2. fresh delivery is closer (people moved) ----------
  await c.users.updateOne({ _id: U.sup2 }, { $set: { coords: NEAR_SITE } });
  await c.users.updateOne({ _id: U.van }, { $set: { coords: FAR } });
  const s2 = await breakdown("water", U.drv2, "site-h-57");
  const inc2 = await incOf(s2.incId);
  const [, fresh] = await tasksFor(s2.needId, "deliver");
  assert.equal(fresh.assignee, U.sup2, "the supplier next to the site");
  assert.equal(fresh.replaces, s2.t0._id);
  assert.match(fresh.detail, /Fresh delivery: .*broke down \(Flat tire at km 14, I cannot move\)\. Bring 30 water to site 57/);
  const [assist2] = await tasksFor(inc2._id, "assist");
  assert.equal(assist2.assignee, U.mech, "the mechanic is nearer than the far van");
  assert.equal(inc2.status, "helping");
  assert(inc2.actions.some((a) => /fresh delivery from another supplier/.test(a.what)));
  ok("fresh: the supplier next to the site beats a relay by a van that is far away");

  // ---------- 3. nobody can replace it: escalated, delayed ----------
  await c.users.updateMany({ _id: { $in: [U.van, U.mech] } }, { $set: { status: "offline" } });
  const s3 = await breakdown("tents", U.drv3, "site-h-57");
  const inc3 = await incOf(s3.incId);
  const [, none] = await tasksFor(s3.needId, "deliver");
  assert.equal(none.status, "escalated");
  assert.equal(inc3.status, "escalated");
  assert.equal((await c.needs.findOne({ _id: s3.needId }))!.status, "open");
  assert((await noticesOf(U.ask)).some((m) => /Tents for site 57: delayed, a new supplier is being found/.test(m)));
  assert((await noticesOf(U.field)).some((m) => /delayed, finding a new supplier/.test(m)), "the waiting team hears there is no supplier yet");
  assert((await inboxOf(U.c1, "incident")).some((i) => i.incidentId === inc3._id && /a coordinator decides/.test(i.message)));
  ok("nobody can replace it: incident escalated, the need is open, the waiting team hears 'delayed, finding a new supplier'");
  await c.users.updateMany({ _id: { $in: [U.van, U.mech] } }, { $set: { status: "available" } });

  // ---------- 4. short_supply ----------
  const mats = await need(U.ask2, "mats", 30, "site-h-57");
  const matId = mats.result!.recordIds[0];
  const [m0] = await tasksFor(matId, "deliver");
  assert.equal(m0.assignee, U.supS1);
  await answer(U.supS1, m0._id, "accepted");
  const sh = await incident(U.supS1, "short_supply", "I only have 12 of the 30", m0._id, true, { canDeliver: 12 });
  assert.equal(sh.status, "done", sh.result?.reason);
  const shId = `inc-${sh._id}`;
  assert.equal((await taskById(m0._id)).open, true, "the 12 go ahead");
  assert.equal((await taskById(m0._id)).assignee, U.supS1);
  assert.match((await taskById(m0._id)).title, /Bring 12 mats/);
  assert.equal((await c.needs.findOne({ _id: matId }))!.quantity, 12);
  const rest = (await c.needs.findOne({ _id: `need-${sh._id}-rest` }))!;
  assert.equal(rest.quantity, 18); assert.equal(rest.item, "mats");
  const [r0] = await tasksFor(rest._id, "deliver");
  assert.equal(r0.assignee, U.supS2, "the next supplier with stock, not the one who is short");
  assert.equal(r0.status, "assigned");
  assert.equal((await incOf(shId)).status, "helping");
  assert((await incOf(shId)).actions.some((a) => /12 of 30 mats continue, the other 18/.test(a.what)));
  const b4 = await counts();
  await again(sh._id!);
  assert.deepEqual(await counts(), b4);
  assert.equal((await c.needs.findOne({ _id: matId }))!.quantity, 12);
  ok("short_supply: the 12 continue, the other 18 are a new open need with a deliver task to the next supplier; a re-run changes nothing");

  // ---------- 5. road_blocked ----------
  const rb = await incident(U.rep, "road_blocked", "I cannot get through on Front Street", undefined, true, { coords: SITE });
  assert.equal(rb.status, "done", rb.result?.reason);
  const road = (await c.roads.find({ deskId: DESK }).toArray())[0];
  assert(road, "a road record"); assert.equal(road.road, "Front Street"); assert.equal(road.state, "unconfirmed");
  assert((await noticesOf(U.field)).some((m) => /Front Street is reported closed, not confirmed/.test(m)), "the field team with a task there is told");
  assert.equal((await taskById((await tasksFor("site-h-57", "rescue"))[0]._id)).status, "accepted", "the task continues");
  assert.equal((await incOf(`inc-${rb._id}`)).status, "helping");
  const b5 = await counts();
  await again(rb._id!);
  assert.deepEqual(await counts(), b5);
  ok("road_blocked: an unconfirmed closure on Front Street, the people with a task near it are told, the task continues; a re-run changes nothing");

  // ---------- 6. cannot_find, twice ----------
  await c.sites.insertOne(mkSite("site-h-70", 70, [37.6, 38.1]));
  const call0 = fixture({ type: "call", recordId: "site-h-70", assignee: U.cf1, title: "Call about site 70" });
  await c.tasks.insertOne(call0);
  const cf = await incident(U.cf1, "cannot_find", "Nobody lives at this address", call0._id, false);
  assert.equal(cf.status, "done", cf.result?.reason);
  assert.equal((await taskById(call0._id)).status, "blocked");
  assert.equal((await c.sites.findOne({ _id: "site-h-70" }))!.callStatus, "not_called");
  const [, call1] = await tasksFor("site-h-70", "call");
  assert(call1 && call1.open && call1.assignee && call1.assignee !== U.cf1, `a volunteer verifies by phone (${call1?.assignee})`);
  assert.equal((await incOf(`inc-${cf._id}`)).status, "helping");
  const b6 = await counts();
  await again(cf._id!);
  assert.deepEqual(await counts(), b6);
  await answer(call1.assignee!, call1._id, "accepted");
  const cf2 = await incident(call1.assignee!, "cannot_find", "Still cannot find it", call1._id, false);
  assert.equal(cf2.status, "done", cf2.result?.reason);
  const inc6 = await incOf(`inc-${cf2._id}`);
  assert.equal(inc6.status, "escalated");
  assert((await tasksFor("site-h-70", "call")).every((t) => !t.open), "no third call task: a coordinator decides");
  assert(inc6.actions.some((a) => /second time/.test(a.what)));
  assert((await inboxOf(U.c1, "incident")).some((i) => i.incidentId === inc6._id && /second time/.test(i.message)));
  ok("cannot_find: the site goes back to not called and a volunteer calls; the second time it escalates; re-run changes nothing");

  // ---------- 7. injury ----------
  await c.sites.insertOne(mkSite("site-h-80", 80, [37.7, 38.2]));
  const resc = fixture({ type: "rescue", recordId: "site-h-80", assignee: U.fieldU, title: "Rescue at site 80" });
  const callHere = fixture({ type: "call", recordId: "site-h-80", assignee: U.volU, title: "Call about site 80" });
  await c.tasks.insertMany([resc, callHere]);
  const inj = await incident(U.fieldU, "injury", "A team member is hurt, gas smell", resc._id, false, { coords: [37.7, 38.2] });
  assert.equal(inj.status, "done", inj.result?.reason);
  const inc7 = await incOf(`inc-${inj._id}`);
  assert.equal(inc7.severity, "critical"); assert.equal(inc7.status, "escalated");
  assert.equal((await taskById(resc._id)).status, "blocked");
  assert.match((await c.sites.findOne({ _id: "site-h-80" }))!.hazard ?? "", /gas smell/);
  assert((await noticesOf(U.volU)).some((m) => /Warning at site 80/.test(m)), "everyone with a task there is warned");
  const [help] = await tasksFor(inc7._id, "assist");
  assert.equal(help.risk, "high"); assert.equal(help.status, "waiting_approval");
  assert.match(help.detail, /Proposed team: check-h-vol-first-aid/);
  assert((await inboxOf(U.c1, "approval")).some((i) => i.taskId === help._id));
  assert.equal((await userOf(U.fieldU)).status, "busy");
  const b7 = await counts();
  await again(inj._id!);
  assert.deepEqual(await counts(), b7);
  ok("injury: task blocked, site flagged, warning to the others there, a high-risk medical task waits for a coordinator, always critical; re-run changes nothing");

  // ---------- 8. other ----------
  const ot = await incident(U.oth, "other", "Something odd", undefined, true);
  const inc8 = await incOf(`inc-${ot._id}`);
  assert.equal(inc8.status, "escalated");
  assert(inc8.actions.some((a) => /nothing is automated/.test(a.what)));
  assert((await inboxOf(U.c1, "incident")).some((i) => i.incidentId === inc8._id));
  ok("other: no automation, straight to the coordinators");

  const left = await c.events.countDocuments({ deskId: DESK, status: { $nin: ["done", "merged", "rejected"] } });
  assert.equal(left, 0, "every event ended");
  console.log(`\n${passed} checks passed`);
}

main()
  .catch((err) => { console.error("\nFAILED:", err instanceof Error ? err.message : err); if (err instanceof Error) console.error(err.stack); process.exitCode = 1; })
  .finally(async () => { try { await cleanup(); } finally { await closeDb(); } });
