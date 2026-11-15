// Check for the group B handlers: npm run handlers:check
// Roads (closure), shelters (capacity), zones (alert) and corrections, on a throwaway desk
// "check-handlers" with its own people. The real desk is never touched, the seeded people are
// never changed, and everything made here is deleted in the end.
// Events go into the queue already "working" (like keeper-check), so a Brain that happens to be
// running on the same cluster cannot take them: only this process applies them.
import assert from "node:assert/strict";
import { processEvent } from "../workers/brain";
import { roadWarning } from "../workers/dispatcher";
import { closeDb, cols, newId } from "./db";
import { pointInPolygon } from "./geo";
import { conflictNote, resolveConflict, trustedClash } from "./rules/conflict";
import { scored } from "./rules/priority";
import type { Event, EventType, LatLng, Need, NewEvent, Site, Source, Task, User } from "./types";

const DESK = "check-handlers";
let passed = 0;
const ok = (msg: string) => { passed++; console.log(`ok  ${msg}`); };

const queued: Event[] = [];
const T0 = new Date(Date.now() - 60 * 60_000); // an hour ago: every observedAt below is relative to it
const at = (min: number) => new Date(T0.getTime() + min * 60_000);
let n = 0;

async function post<P>(e: Pick<NewEvent<P>, "type" | "source" | "actor" | "payload" | "observedAt">): Promise<string> {
  const { events } = await cols();
  const now = new Date();
  const doc: Event = {
    _id: newId(), deskId: DESK, ts: now, observedAt: e.observedAt ?? now, type: e.type, source: e.source, actor: e.actor,
    lane: e.source === "person" || e.source === "system" ? 0 : 1, payload: e.payload,
    status: "working", lockedAt: now, attempts: 1, dedupeKey: `check:handlers:${Date.now()}:${n++}`,
  };
  await events.insertOne(doc);
  queued.push(doc);
  return doc._id!;
}
async function drain() {
  queued.sort((a, b) => a.lane - b.lane || a.ts.getTime() - b.ts.getTime());
  while (queued.length) await processEvent(queued.shift()!);
}
/** Post one event and apply it now. Returns the stored event with its result. */
async function send<P>(type: EventType, source: Source, actor: string, payload: P, observedAt?: Date) {
  const id = await post({ type, source, actor, payload, observedAt });
  await drain();
  return (await (await cols()).events.findOne({ _id: id }))!;
}
/** Apply a stored event a second time, as after a crash. */
async function again(id: string) {
  const ev = (await (await cols()).events.findOne({ _id: id }))!;
  await processEvent({ ...ev, status: "working" });
}

const U = {
  volNear: "check-h-vol-near", volFar: "check-h-vol-far", volRegion: "check-h-vol-region", volOther: "check-h-vol-other",
  shelter: "check-h-shelter", coord1: "check-h-coord-1", coord2: "check-h-coord-2",
  vetted: "check-h-vetted", vetted2: "check-h-vetted-2", official: "check-h-official",
};
const R = "check-region";

function people(): User[] {
  const base = { region: R, status: "available" as const, deskId: DESK, lastSeen: new Date() };
  return [
    { ...base, _id: U.volNear, name: "Near volunteer", role: "volunteer", trust: "vetted" },
    { ...base, _id: U.volFar, name: "Far volunteer", role: "volunteer", trust: "vetted" },
    { ...base, _id: U.volRegion, name: "Region volunteer", role: "volunteer", trust: "vetted" },
    { ...base, _id: U.volOther, name: "Other volunteer", role: "volunteer", trust: "vetted", region: "other-region" },
    { ...base, _id: U.shelter, name: "Shelter keeper", role: "shelter", trust: "vetted" },
    { ...base, _id: U.coord1, name: "Coordinator 1", role: "coordinator", trust: "official" },
    { ...base, _id: U.coord2, name: "Coordinator 2", role: "coordinator", trust: "official" },
    { ...base, _id: U.vetted, name: "Vetted one", role: "volunteer", trust: "vetted", status: "offline" },
    { ...base, _id: U.vetted2, name: "Vetted two", role: "volunteer", trust: "vetted", status: "offline" },
    { ...base, _id: U.official, name: "Official one", role: "field", trust: "official", status: "offline" },
  ];
}

function mkSite(id: string, region: string, coords?: LatLng): Site {
  const now = new Date();
  return {
    _id: id, address: `${id} street`, ...(coords ? { coords } : {}), region, peopleTrapped: 1, callStatus: "called",
    status: "open", sources: [], history: [], deskId: DESK, confidence: "unconfirmed", observedAt: now, tier: 0, support: 1,
    ...scored({ support: 1, waitingSince: now }, now),
  };
}
function mkNeed(id: string, item: string, region: string): Need {
  const now = new Date();
  return {
    _id: id, item, quantity: 10, region, siteIds: [], status: "assigned",
    history: [{ ts: now, by: "check", source: "system", reason: "test need" }], deskId: DESK, confidence: "confirmed",
    lifeThreatening: false, lines: [{ quantity: 10 }], tier: 1, support: 1, requestedBy: [],
    ...scored({ support: 1, waitingSince: now }, now),
  };
}
const mkTask = (id: string, assignee: string, recordId: string, recordType: "site" | "need" = "site"): Task => ({
  _id: id, type: "call", recordType, recordId, assignee, tried: [], risk: "low", tier: 0, priority: 50, status: "assigned",
  open: true, title: `Task ${id}`, detail: "", deadline: new Date(Date.now() + 120_000), history: [], deskId: DESK,
});

async function cleanup() {
  const c = await cols();
  await c.inbox.deleteMany({ userId: { $in: Object.values(U) } });
  await Promise.all([
    c.events.deleteMany({ deskId: DESK }), c.sites.deleteMany({ deskId: DESK }), c.needs.deleteMany({ deskId: DESK }),
    c.roads.deleteMany({ deskId: DESK }), c.shelters.deleteMany({ deskId: DESK }), c.zones.deleteMany({ deskId: DESK }),
    c.incidents.deleteMany({ deskId: DESK }), c.tasks.deleteMany({ deskId: DESK }), c.users.deleteMany({ deskId: DESK }),
    c.meta.deleteMany({ _id: { $in: [`cases:${DESK}`, `version:${DESK}`] } }),
  ]);
}

function pure() {
  const stamp = (trust: "public" | "vetted" | "official", min: number) => ({ trust, observedAt: at(min), source: "sheet" as Source });
  assert.equal(resolveConflict(stamp("vetted", 0), stamp("public", 5)).winner, "stored", "lower trust loses even when newer");
  assert.equal(resolveConflict(stamp("public", 0), stamp("official", -5)).winner, "incoming", "higher trust wins even when older");
  assert.equal(resolveConflict(stamp("vetted", 0), stamp("vetted", 1)).winner, "incoming", "equal trust: newer wins");
  assert.equal(resolveConflict(stamp("vetted", 0), stamp("vetted", -1)).winner, "stored", "equal trust: older loses");
  assert.equal(resolveConflict(stamp("vetted", 0), stamp("vetted", 0)).winner, "stored", "a tie keeps what is stored");
  ok("conflict.ts: higher trust wins, equal trust newer wins, a tie keeps the stored value");
  assert(trustedClash(stamp("vetted", 0), stamp("official", 9)));
  assert(!trustedClash(stamp("vetted", 0), stamp("official", 11)), "11 minutes apart: no confirm");
  assert(!trustedClash(stamp("vetted", 0), stamp("public", 1)), "a public source never asks for a confirm");
  const note = conflictNote(resolveConflict(stamp("vetted", 0), stamp("public", 2)), stamp("vetted", 0), "41/60", stamp("public", 2), "58/60");
  assert(note.startsWith("kept 41/60 from sheet (vetted), ignored 58/60 from sheet (public)"), note);
  ok("conflict.ts: trustedClash within 10 minutes only, history line names kept and ignored");
  const ring = [[[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]], [[4, 4], [4, 6], [6, 6], [6, 4], [4, 4]]];
  assert(pointInPolygon([2, 2], ring)); assert(!pointInPolygon([5, 5], ring), "inside the hole"); assert(!pointInPolygon([20, 2], ring));
  ok("geo.ts: pointInPolygon with a hole");
}

async function main() {
  pure();
  await cleanup();
  const c = await cols();
  await c.users.insertMany(people());
  const count = (userId: string, text: string) => c.inbox.countDocuments({ userId, kind: "notice", message: { $regex: text } });
  const total = () => c.inbox.countDocuments({ userId: { $in: Object.values(U) } });

  // ---------- closure ----------
  const near: LatLng = [36.2, 36.15];
  await c.sites.insertMany([
    mkSite("h-near", R, near), mkSite("h-far", R, [36.3, 36.3]), mkSite("h-nocoords", R), mkSite("h-other", "other-region", [36.35, 36.35]),
  ]);
  await c.tasks.insertMany([
    mkTask("h-t1", U.volNear, "h-near"), mkTask("h-t2", U.volFar, "h-far"), mkTask("h-t3", U.volRegion, "h-nocoords"),
    mkTask("h-t4", U.volOther, "h-other"),
  ]);

  const c1 = await send("closure", "facebook", "facebook-agent",
    { road: "Front St", state: "closed", reason: "power pole down", coords: [36.2005, 36.1505] as LatLng }, at(0));
  assert.equal(c1.status, "done", c1.result?.reason);
  const roads = await c.roads.find({ deskId: DESK }).toArray();
  assert.equal(roads.length, 1);
  const road = roads[0];
  assert.equal(road.state, "closed"); assert.equal(road.confidence, "unconfirmed"); assert.equal(road.region, R, "region from the nearest site");
  assert.equal(road.history.length, 1); assert.equal(road.source, "facebook");
  ok("closure creates a road: closed, unconfirmed, source facebook, region from the nearest site");
  assert.equal(await count(U.volNear, "^Front St is closed \\(unconfirmed, facebook, "), 1, "near volunteer told");
  assert.equal(await count(U.volRegion, "^Front St is closed"), 1, "same region, site without coords: told");
  assert.equal(await count(U.volFar, "Front St"), 0, "same region but 10 km away by coordinates: not told");
  assert.equal(await count(U.volOther, "Front St"), 0, "other region: not told");
  const msg = (await c.inbox.findOne({ userId: U.volNear, kind: "notice" }))!.message;
  assert(!/instead|detour|alternative|use /i.test(msg), `no alternative road named: ${msg}`);
  ok(`notice only to the right assignees, once, no alternative road: "${msg}"`);

  const before = await total();
  await again(c1._id!);
  assert.equal(await total(), before); assert.equal((await c.roads.findOne({ _id: road._id }))!.history.length, 1);
  ok("closure re-run changes nothing");

  const c2 = await send("closure", "person", U.vetted, { road: "Front St.", state: "open", reason: "cleared" }, at(5));
  assert.equal(c2.status, "merged", c2.result?.reason);
  let r = (await c.roads.findOne({ _id: road._id }))!;
  assert.equal(r.state, "open"); assert.equal(r.confidence, "confirmed"); assert.equal(r.history.length, 2);
  assert.equal((await c.roads.countDocuments({ deskId: DESK })), 1, "same road, not a second one");
  assert.equal(await count(U.volNear, "Front St is open again \\(confirmed, person"), 1);
  ok("second report for the same road (other spelling) updates it: vetted beats public, 'open again' notice");

  const c3 = await send("closure", "facebook", "facebook-agent", { road: "Another name", state: "closed", reason: "again", coords: [36.2005, 36.1506] as LatLng }, at(8));
  assert.equal(c3.status, "merged");
  r = (await c.roads.findOne({ _id: road._id }))!;
  assert.equal(r.state, "open", "a later public report does not beat a vetted one");
  assert(r.history[2].reason.startsWith("kept open from person (vetted), ignored closed from facebook (public)"), r.history[2].reason);
  assert.equal(await count(U.volNear, "Front St"), 2, "the losing report sends no notice");
  assert.equal(await c.roads.countDocuments({ deskId: DESK }), 1, "coords within 100 m match the road");
  ok("lower trust loses and stays in the history; match by coordinates within 100 m; no notice for the loser");

  // ---------- capacity ----------
  const s1 = await send("capacity", "person", U.vetted, { shelter: "Shelter A", bedsUsed: 41, bedsTotal: 60 }, at(0));
  assert.equal(s1.status, "done", s1.result?.reason);
  await send("capacity", "person", U.vetted, { shelter: "Shelter B", bedsUsed: 40, bedsTotal: 120 }, at(0));
  const shelters = await c.shelters.find({ deskId: DESK }).toArray();
  assert.equal(shelters.length, 2);
  const A = shelters.find((s) => s.name === "Shelter A")!;
  assert.equal(A.region, R); assert.equal(A.bedsUsed, 41);
  ok("capacity creates shelters (region from the sender)");
  const fullCount = () => count(U.volNear, "send new arrivals");

  const s2 = await send("capacity", "instagram", "instagram-agent", { shelter: "shelter a", bedsUsed: 58, bedsTotal: 60 }, at(2));
  assert.equal(s2.status, "merged");
  let a = (await c.shelters.findOne({ _id: A._id }))!;
  assert.equal(a.bedsUsed, 41, "public photo loses to the vetted number");
  assert(a.history.at(-1)!.reason.startsWith("kept 41/60 from person (vetted), ignored 58/60 from instagram (public)"), a.history.at(-1)!.reason);
  assert.equal(await fullCount(), 0); assert.equal(await count(U.shelter, "confirm"), 0, "public never asks for a confirm");
  ok("capacity: lower trust loses, kept in the history, no 90% notice, no confirm");

  await send("capacity", "person", U.vetted2, { shelter: "Shelter A", bedsUsed: 30, bedsTotal: 60 }, at(-5));
  a = (await c.shelters.findOne({ _id: A._id }))!;
  assert.equal(a.bedsUsed, 41, "equal trust, older: loses");
  assert.equal(await count(U.shelter, "confirm"), 1, "two vetted sources disagree within 10 min");
  await send("capacity", "person", U.vetted2, { shelter: "Shelter A", bedsUsed: 50, bedsTotal: 60 }, at(1));
  a = (await c.shelters.findOne({ _id: A._id }))!;
  assert.equal(a.bedsUsed, 50, "equal trust, newer: wins");
  assert.equal(await count(U.shelter, "Please confirm"), 2);
  assert.equal(await fullCount(), 0, "83% is not above 90%");
  ok("capacity: equal trust older loses, newer wins; two vetted sources within 10 min send the shelter a confirm notice");

  const s3 = await send("capacity", "person", U.official, { shelter: "Shelter A", bedsUsed: 58, bedsTotal: 60 }, at(3));
  a = (await c.shelters.findOne({ _id: A._id }))!;
  assert.equal(a.bedsUsed, 58); assert.equal(a.trust, "official");
  for (const u of [U.volNear, U.volFar, U.volRegion]) assert.equal(await count(u, "^Shelter A 58/60: send new arrivals to Shelter B \\(40/120\\)$"), 1, u);
  assert.equal(await count(U.volOther, "Shelter"), 0);
  await send("capacity", "person", U.official, { shelter: "Shelter A", bedsUsed: 59, bedsTotal: 60 }, at(4));
  assert.equal(await fullCount(), 1, "once per crossing, not on every update");
  const beforeS = await total();
  await again(s3._id!);
  assert.equal(await total(), beforeS); assert.equal((await c.shelters.findOne({ _id: A._id }))!.history.length, a.history.length + 1);
  ok("capacity above 90% names the shelter with most free beds, once per crossing; re-run changes nothing");

  // ---------- alert ----------
  const inZone: LatLng = [36.194, 36.157];
  await c.sites.insertMany([mkSite("h-zone", "zone-site-region", inZone), mkSite("h-outside", "zone-site-region", [36.3, 36.3])]);
  await c.needs.insertMany([mkNeed("h-blankets", "blankets", "antakya-merkez"), mkNeed("h-water", "water", "antakya-merkez")]);
  await c.tasks.insertOne(mkTask("h-tz", U.volNear, "h-zone"));
  const partsOf = async (col: "sites" | "needs", id: string) => {
    const rec = (await (col === "sites" ? c.sites : c.needs).findOne({ _id: id }))!;
    const parts = rec.scoreParts ?? [];
    assert.equal(rec.priority, parts.reduce((s, p) => s + p.value, 0), "priority = sum of parts");
    return parts;
  };
  const val = (parts: { name: string; value: number }[], name: string) => parts.find((p) => p.name === name)?.value;

  const al1 = await send("alert", "nasa", "satellite-watcher",
    { zoneId: "antakya-turuncu", kind: "silent_zone", evidence: { damage: 0.65, dark: true, calls: 1 } }, at(10));
  assert.equal(al1.status, "done", al1.result?.reason);
  const zone = (await c.zones.findOne({ deskId: DESK }))!;
  assert(zone.silentZone); assert.equal(zone.damage, 0.65); assert.equal(zone.dark, true); assert.equal(zone.calls, 1);
  assert.equal(zone.region, "antakya-merkez");
  ok("alert creates the zone (silent zone, damage, dark, calls)");
  assert.equal(val(await partsOf("sites", "h-zone"), "silent zone"), 30, "site in the zone +30");
  assert.equal(val(await partsOf("sites", "h-outside"), "silent zone"), undefined, "site outside the polygon: untouched");
  assert.equal(val(await partsOf("needs", "h-blankets"), "silent zone"), 30);
  assert.equal(val(await partsOf("needs", "h-water"), "silent zone"), 30);
  const tz = (await c.tasks.findOne({ _id: "h-tz" }))!;
  assert.equal(tz.priority, (await c.sites.findOne({ _id: "h-zone" }))!.priority, "open task gets the new priority");
  ok("silent zone: +30 on the site inside the polygon (not outside), on needs in its region, copied to the open task");

  const zt = await c.tasks.find({ deskId: DESK, recordType: "zone" }).toArray();
  assert.equal(zt.length, 1); assert.equal(zt[0].risk, "high"); assert.equal(zt[0].status, "waiting_approval"); assert(zt[0].open);
  assert.match(zt[0].title, /^Send a field team to .*\?$/);
  const approvals = await c.inbox.find({ kind: "approval", taskId: zt[0]._id }).toArray();
  assert.deepEqual(approvals.map((i) => i.userId).sort(), [U.coord1, U.coord2]);
  ok("silent zone makes one high-risk task waiting_approval, one approval per coordinator");

  const al2 = await send("alert", "nasa", "satellite-watcher", { zoneId: "antakya-turuncu", kind: "cold", evidence: { minTempC: -3 } }, at(11));
  const z2 = (await c.zones.findOne({ _id: zone._id }))!;
  assert(z2.cold); assert.equal(z2.minTempC, -3); assert(z2.silentZone, "cold does not clear the silent flag");
  const bl = await partsOf("needs", "h-blankets");
  assert.equal(val(bl, "cold night"), 20); assert.equal(val(bl, "silent zone"), 30, "both terms add");
  assert.equal(val(await partsOf("needs", "h-water"), "cold night"), undefined, "water is not warmth");
  await send("alert", "nasa", "satellite-watcher", { zoneId: "antakya-turuncu", kind: "silent_zone", evidence: { calls: 0 } }, at(12));
  assert.equal(await c.tasks.countDocuments({ deskId: DESK, recordType: "zone" }), 1, "one task per zone, ever");
  const hz = (await c.zones.findOne({ _id: zone._id }))!.history!.length;
  await again(al2._id!);
  assert.equal((await c.zones.findOne({ _id: zone._id }))!.history!.length, hz);
  assert.equal(val(await partsOf("needs", "h-blankets"), "cold night"), 20, "not added twice");
  assert.equal(await c.zones.countDocuments({ deskId: DESK }), 1);
  ok("cold: +20 on the warmth need only, adds to the silent term; a second silent alert makes no second task; re-run changes nothing");

  // ---------- corrections ----------
  const corr = (payload: Record<string, unknown>, actor: string = U.vetted, source: Source = "person") =>
    send("correction", source, actor, { reason: "checked on the phone", ...payload });

  const rt = await corr({ action: "retract", recordType: "site", recordId: "h-near" });
  assert.equal(rt.status, "merged", rt.result?.reason);
  const sNear = (await c.sites.findOne({ _id: "h-near" }))!;
  assert.equal(sNear.status, "retracted"); assert.match(sNear.history.at(-1)!.reason, /retracted by check-h-vetted: checked on the phone/);
  const t1 = (await c.tasks.findOne({ _id: "h-t1" }))!;
  assert.equal(t1.status, "cancelled"); assert.equal(t1.open, false);
  assert.equal(await count(U.volNear, "^Stop: Task h-t1"), 1);
  const beforeR = await total();
  await again(rt._id!);
  assert.equal(await total(), beforeR); assert.equal((await c.sites.findOne({ _id: "h-near" }))!.history.length, sNear.history.length);
  ok("retract: site retracted with the reason, its task cancelled, the assignee told once; re-run changes nothing");

  const rn = await corr({ action: "retract", recordType: "need", recordId: "h-water" });
  assert.equal((await c.needs.findOne({ _id: "h-water" }))!.status, "cancelled"); assert.equal(rn.status, "merged");
  ok("retract: need cancelled");

  const ed = await corr({ action: "edit", recordType: "site", recordId: "h-zone", fields: { address: "New Street 5", peopleTrapped: 0 } });
  assert.equal(ed.status, "merged", ed.result?.reason);
  const sz = (await c.sites.findOne({ _id: "h-zone" }))!;
  assert.equal(sz.address, "New Street 5"); assert.equal(sz.peopleTrapped, 0); assert.equal(sz.tier, 1);
  assert.match(sz.history.at(-1)!.reason, /address "h-zone street" → "New Street 5", peopleTrapped 1 → 0/);
  const hl = sz.history.length;
  await again(ed._id!);
  assert.equal((await c.sites.findOne({ _id: "h-zone" }))!.history.length, hl);
  const en = await corr({ action: "edit", recordType: "need", recordId: "h-blankets", fields: { quantity: 25 } });
  assert.equal(en.status, "merged", en.result?.reason);
  const nb = (await c.needs.findOne({ _id: "h-blankets" }))!;
  assert.equal(nb.quantity, 25); assert.equal(nb.lines[0].quantity, 25);
  ok("edit: whitelisted fields change, old → new in the history, re-run changes nothing");

  const bad = [
    await corr({ action: "edit", recordType: "site", recordId: "h-zone", fields: { status: "closed" } }),
    await corr({ action: "edit", recordType: "site", recordId: "h-zone", fields: { address: "ok", callStatus: "verified" } }),
    await corr({ action: "edit", recordType: "site", recordId: "h-zone", fields: { peopleTrapped: -2 } }),
    await corr({ action: "edit", recordType: "need", recordId: "h-blankets", fields: { item: "gold" } }),
    await corr({ action: "split", recordType: "site", recordId: "h-zone", eventIds: ["x"] }),
    await corr({ action: "merge", recordType: "site", recordId: "h-zone", otherRecordId: "h-far" }),
    await corr({ action: "retract", recordType: "road", recordId: road._id }),
    await corr({ action: "retract", recordType: "site", recordId: "no-such-site" }),
    await corr({ action: "retract", recordType: "site", recordId: "h-zone" }, "satellite-watcher", "system"),
  ];
  assert(bad.every((e) => e.status === "rejected" && e.result?.reason), bad.map((e) => e.result?.reason).join(" | "));
  assert.match(bad[0].result!.reason, /cannot edit status/); assert.match(bad[4].result!.reason, /split correction is not supported/);
  assert.equal((await c.sites.findOne({ _id: "h-zone" }))!.status, "open", "nothing changed");
  ok(`disallowed edit, split, merge and unknown record are rejected with a reason ("${bad[0].result!.reason}")`);

  // ---------- bad payloads ----------
  const badPayloads = [
    await send("closure", "facebook", "facebook-agent", { road: "", state: "closed", reason: "" }),
    await send("capacity", "instagram", "instagram-agent", { shelter: "X", bedsUsed: 9, bedsTotal: 3 }),
    await send("alert", "nasa", "satellite-watcher", { zoneId: "z", kind: "flood", evidence: {} }),
  ];
  assert(badPayloads.every((e) => e.status === "rejected" && e.result?.reason));
  ok("invalid closure, capacity and alert payloads are rejected with a reason");

  // ---------- v2.5: shelter position, report hazard, road warning on a task ----------
  const sp = await send("capacity", "x", "x-agent",
    { shelter: "Tent city C", bedsUsed: 130, bedsTotal: 150, coords: [36.21, 36.16] as LatLng, region: "check-region-c" }, at(10));
  assert.equal(sp.status, "done", sp.result?.reason);
  let tc = (await c.shelters.findOne({ deskId: DESK, name: "Tent city C" }))!;
  assert.deepEqual(tc.coords, [36.21, 36.16]); assert.equal(tc.region, "check-region-c");
  await send("capacity", "x", "x-agent", { shelter: "tent city c", bedsUsed: 140, bedsTotal: 150, coords: [1, 1] as LatLng, region: "elsewhere" }, at(11));
  tc = (await c.shelters.findOne({ _id: tc._id }))!;
  assert.deepEqual(tc.coords, [36.21, 36.16], "a known position is never overwritten"); assert.equal(tc.region, "check-region-c");
  ok("capacity with coords and region: a new shelter gets its position; a later post does not move it");

  const hzEv = await send("report", "x", "x-agent",
    { kind: "trapped", text: "Enkaz altında 2 kişi, gaz kokusu var", textEn: "2 people under rubble, gas smell", address: "Hazard Street 1",
      coords: [36.25, 36.25] as LatLng, region: R, peopleCount: 2, hazard: "gas smell at the site" }, at(12));
  assert.equal(hzEv.status, "done", hzEv.result?.reason);
  const hs = (await c.sites.findOne({ _id: hzEv.result!.recordIds[0] }))!;
  assert.equal(hs.hazard, "gas smell at the site"); assert(!hs.posts?.[0].textEn.includes("[Hazard"), "the hazard is a field, not a text prefix");
  await send("report", "x", "x-agent",
    { kind: "trapped", text: "Hazard Street 1, yangın", textEn: "Hazard Street 1, fire", address: "Hazard Street 1",
      coords: [36.25, 36.25] as LatLng, region: R, hazard: "fire" }, at(13));
  assert.equal((await c.sites.findOne({ _id: hs._id }))!.hazard, "gas smell at the site", "a hazard is added, never replaced");
  ok("report hazard → Site.hazard on a new site; a second report does not replace it");

  await send("closure", "x", "x-agent", { road: "Kale bridge road", state: "unconfirmed", reason: "rubble (tweet)", coords: [36.255, 36.25] as LatLng }, at(14));
  const rescue = { ...mkTask("h-rescue", U.official, hs._id), type: "rescue" as const };
  const warn = await roadWarning(rescue);
  assert.match(warn, /^ Road: Kale bridge road reported closed, 560 m from the place \(unconfirmed, x, \d+ min ago\)\. Check your route\.$/, warn);
  assert.equal(await roadWarning({ ...rescue, type: "call" }), "", "a call needs no travel");
  assert.equal(await roadWarning(mkTask("h-far-rescue", U.official, "h-far")), "", "call task far away");
  assert.equal(await roadWarning({ ...mkTask("h-far-rescue", U.official, "h-far"), type: "rescue" }), "", "no road within 1.5 km");
  ok(`a rescue task near a road that is not open carries the warning: "${warn.trim()}"`);

  console.log(`\n${passed} checks passed`);
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(async () => { await cleanup().catch((e) => console.error("cleanup failed", e)); await closeDb(); });
