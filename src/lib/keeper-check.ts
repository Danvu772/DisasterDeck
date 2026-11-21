// CP1 and CP2 check for the Brain: npm run keeper:check
// Replays five inline demo tweets plus edge cases into a separate desk,
// "check-cp1", runs the Brain on that desk only, checks the sites, then deletes everything it
// made. The shared board (antakya-2023) is not touched. Also checks GET /api/events?since=.
// CP2: throwaway people on the same desk, then a report becomes a site and a call task, an
// accept, a done, an approval with an assignee, an arrived, a decline, an incident that blocks
// a task, a need and a claim.
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { GET as feed } from "../app/api/events/route";
import { processEvent } from "../workers/brain";
import { refreshPriorities } from "../workers/memory-keeper";
import { maskEvent } from "./feed";
import { closeDb, cols, getBoard, newId } from "./db";
import { demoNowFrom, demoT0, getDemo } from "./demo";
import { eventBody } from "./schemas";
import type { Event, EventOrigin, EventType, LatLng, NewEvent, ReportPayload, Site, Task, User } from "./types";

const DESK = "check-cp1";
let passed = 0;
const ok = (msg: string) => { passed++; console.log(`ok  ${msg}`); };

// The check's own queue. A live Brain on the same cluster (npm run brain on a laptop) takes any
// pending event, so events posted as pending get split between two Brains, and two writers on
// one site at once lose updates. These go in already "working", the shape postEvent() gives them,
// so only this process applies them: lane 0 first, then oldest, through the Brain's processEvent().
const queued: Event[] = [];
async function post<P>(e: NewEvent<P> & { dedupeKey: string }): Promise<string> {
  const { events } = await cols();
  const now = new Date();
  const doc: Event = {
    _id: newId(), deskId: DESK, ts: now, observedAt: e.observedAt ?? now, type: e.type, source: e.source,
    actor: e.actor, lane: e.source === "person" || e.source === "system" ? 0 : 1, payload: e.payload,
    status: "working", lockedAt: now, attempts: 1, dedupeKey: e.dedupeKey,
    ...(e.origin ? { origin: e.origin } : {}),
  };
  await events.insertOne(doc);
  queued.push(doc);
  return doc._id!;
}

async function drain() {
  queued.sort((a, b) => a.lane - b.lane || a.ts.getTime() - b.ts.getTime());
  while (queued.length) await processEvent(queued.shift()!);
}

const report = (key: string, p: ReportPayload, actor = "x-agent", source: "x" | "person" = "x") =>
  post<ReportPayload>({ deskId: DESK, type: "report", source, actor, dedupeKey: `check:cp1:${key}`, payload: p });

// Throwaway people, only on this desk. Ayşe's tweets sit near [36.194, 36.157], the CP2 sites
// near [36.244, 36.247], about 8 km away.
const U = {
  volA: "check-cp1-vol-a", volB: "check-cp1-vol-b", volOld: "check-cp1-vol-old", volStale: "check-cp1-vol-stale",
  field1: "check-cp1-field-1", field2: "check-cp1-field-2", coord1: "check-cp1-coord-1", coord2: "check-cp1-coord-2",
  supplier: "check-cp1-supplier",
};
const SITE_A: LatLng = [36.244, 36.247];
const SITE_B: LatLng = [36.249, 36.252];

function people(): User[] {
  const base = { region: "antakya-merkez", status: "available" as const, deskId: DESK, lastSeen: new Date() };
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);
  return [
    { ...base, _id: U.volA, name: "Check volunteer A", role: "volunteer", trust: "vetted", coords: [36.2445, 36.2475], lastSeen: new Date() },
    { ...base, _id: U.volB, name: "Check volunteer B", role: "volunteer", trust: "vetted", coords: [36.254, 36.257] },
    { ...base, _id: U.volOld, name: "Check volunteer near Ayşe", role: "volunteer", trust: "vetted", coords: [36.195, 36.158] },
    // The nearest of all to site A, but last seen 10 minutes ago: never picked.
    { ...base, _id: U.volStale, name: "Check volunteer gone quiet", role: "volunteer", trust: "vetted", coords: [36.2441, 36.2471], lastSeen: minutesAgo(10) },
    { ...base, _id: U.field1, name: "Check team 1", role: "field", trust: "official", coords: [36.245, 36.248] },
    { ...base, _id: U.field2, name: "Check team 2", role: "field", trust: "official", coords: [36.274, 36.277] },
    { ...base, _id: U.coord1, name: "Check coordinator 1", role: "coordinator", trust: "official" },
    { ...base, _id: U.coord2, name: "Check coordinator 2", role: "coordinator", trust: "official" },
    { ...base, _id: U.supplier, name: "Check supplier", role: "supplier", trust: "vetted", coords: [36.234, 36.237], profile: { stock: { blankets: 50 }, vehicle: "truck" } },
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
  await c.inbox.deleteMany({ userId: { $in: Object.values(U) } });
  await Promise.all([
    c.events.deleteMany({ deskId: DESK }), c.sites.deleteMany({ deskId: DESK }), c.needs.deleteMany({ deskId: DESK }),
    c.incidents.deleteMany({ deskId: DESK }), c.roads.deleteMany({ deskId: DESK }), c.tasks.deleteMany({ deskId: DESK }), c.users.deleteMany({ deskId: DESK }),
    c.meta.deleteMany({ _id: { $in: [`cases:${DESK}`, `version:${DESK}`] } }),
  ]);
}

async function main() {
  await cleanup();
  const c = await cols();
  assert(await c.users.findOne({ _id: "field-alpha" }), "run npm run db:seed first");
  await c.users.insertMany(people());
  const startedAt = new Date(Date.now() - 1);

  // --- the CP1 case: the replay file ---
  const tweets: { id: string; text: string; coords: LatLng; region: string }[] = [
    { id: "demo-antakya-001", coords: [36.194, 36.157], region: "antakya-merkez",
      text: "Tatbikat: Antakya merkez, Turuncu Avlu'da Ayşe enkaz altında. Bir kişi için yardım istiyoruz. Demo irtibat: 000 000 00 42." },
    { id: "demo-antakya-002", coords: [36.194, 36.157], region: "antakya-merkez",
      text: "İlk ihbarı aktarıyorum: Antakya merkezdeki Turuncu Avlu'da Ayşe mahsur kalmış. Tatbikat irtibatı 000 000 00 42." },
    { id: "demo-antakya-003", coords: [36.194, 36.157], region: "antakya-merkez",
      text: "Aynı çağrıyı yeniden paylaşıyorum. Antakya merkez, Turuncu Avlu. Ayşe için ekip bekleniyor, bir kişi enkaz altında." },
    { id: "demo-antakya-004", coords: [36.194, 36.157], region: "antakya-merkez",
      text: "Tatbikat güncellemesi: Turuncu Avlu'daki Ayşe için ilk yardım çağrısını tekrar iletiyorum. Yer Antakya merkez, kişi sayısı bir." },
    { id: "demo-antakya-005", coords: [36.2125, 36.157], region: "antakya-merkez",
      text: "Ayrı tatbikat ihbarı: Antakya merkez, Mor Avlu'da iki kişi enkaz altında. Ekip gerekiyor. Demo irtibat: 000 000 00 73." },
  ];
  for (const t of tweets) {
    const two = t.text.includes("iki kişi");
    await report(t.id, { kind: "trapped", text: t.text, textEn: t.text, coords: t.coords, region: t.region, peopleCount: two ? 2 : 1 });
  }
  await drain();

  let sites = await c.sites.find({ deskId: DESK }).toArray();
  const ayse = sites.find((s) => s.sources.some((x) => x.eventId) && s.coords?.[0] === 36.194) as Site;
  assert.equal(sites.length, 2, `5 tweets → 2 sites, got ${sites.length}`);
  assert.equal(ayse.sources.length, 4, "Ayşe: 4 tweets → one site with 4 sources");
  assert.equal(ayse.support, 4, "4 different wordings are 4 voices");
  assert.equal(ayse.confidence, "corroborated", "3+ public voices");
  assert.equal(ayse.tier, 0); assert.equal(ayse.peopleTrapped, 1); assert.equal(ayse.callStatus, "not_called");
  ok("CP1: 4 tweets about Ayşe → 1 site, 4 sources, support 4, corroborated, tier 0");
  const mor = sites.find((s) => s._id !== ayse._id)!;
  assert.equal(mor.peopleTrapped, 2); assert.equal(mor.sources.length, 1); assert.equal(mor.confidence, "unconfirmed");
  ok("Mor Avlu (2 km away) → its own site, 2 people, unconfirmed");

  // --- edge cases ---
  await report("rt-copy", { kind: "trapped", text: `RT @someone: ${tweets[0].text}`, textEn: "copy" }); // no coords
  await report("addr-a", { kind: "trapped", text: "Çınar Sokak 3'te enkaz", textEn: "rubble at Çınar St 3", address: "Çınar Sokak No: 3" });
  await report("addr-b", { kind: "missing", text: "cinar sk no 3 kimse yok", textEn: "nobody at cinar st 3", address: "cinar sk. no 3" });
  await report("rescued", { kind: "rescued", text: "Ayşe çıkarıldı", textEn: "Ayşe was taken out", coords: [36.1941, 36.1571], peopleCount: 1 },
    "field-alpha", "person");
  await report("orphan-update", { kind: "site_update", text: "far away", textEn: "far away", coords: [39.9, 32.8] });
  await post({ deskId: DESK, type: "report", source: "x", actor: "x-agent", dedupeKey: "check:cp1:bad", payload: { kind: "nonsense" } });
  await drain();

  sites = await c.sites.find({ deskId: DESK }).toArray();
  const ayse2 = sites.find((s) => s._id === ayse._id)!;
  assert.equal(ayse2.sources.length, 6, "RT copy and the rescue added sources");
  assert.equal(ayse2.support, 5, "the RT copy added no support, the field team did");
  ok("RT copy without coords → same site by text, +1 source, no extra support");
  assert.equal(ayse2.peopleTrapped, 0); assert.equal(ayse2.tier, 1); assert.equal(ayse2.confidence, "confirmed");
  ok("field team reports the rescue → 0 trapped, tier 1, confirmed (trusted voice)");
  const cinar = sites.filter((s) => s.address.toLowerCase().includes("nar"));
  assert.equal(cinar.length, 1, "two spellings of one address → one site"); assert.equal(cinar[0].sources.length, 2);
  ok(`"Çınar Sokak No: 3" and "cinar sk. no 3" → one site`);
  assert.equal(sites.length, 3, "no site for the orphan update or the bad payload");
  const rejected = await c.events.find({ deskId: DESK, status: "rejected" }).toArray();
  assert.equal(rejected.length, 2);
  ok(`rejected with a reason: ${rejected.map((e) => `"${e.result?.reason}"`).join(", ")}`);

  // --- running an event twice changes nothing ---
  const again = await c.events.findOne({ dedupeKey: "check:cp1:demo-antakya-002" });
  await processEvent({ ...again!, status: "working" });
  const ayse3 = await c.sites.findOne({ _id: ayse._id });
  assert.equal(ayse3!.sources.length, 6, "no duplicate source"); assert.equal(ayse3!.history.length, ayse2.history.length);
  ok("applying an event twice adds nothing (safe after a crash)");

  // --- history and the board ---
  assert(ayse3!.history.every((h) => h.by && h.reason && h.ts instanceof Date && h.source));
  const board = await getBoard(DESK);
  assert.deepEqual(board.sites.map((s) => s.tier), [...board.sites.map((s) => s.tier)].sort());
  ok(`history on every change (${ayse3!.history.length} entries on Ayşe's site); board sorted by tier`);

  // --- GET /api/events?since= ---
  const get = async (qs: string) => {
    const res = await feed(new Request(`http://localhost/api/events?desk=${DESK}&${qs}`));
    return { status: res.status, body: await res.json() };
  };
  const all = await get(`since=${startedAt.toISOString()}&limit=500`);
  assert.equal(all.status, 200); assert.equal(all.body.length, 11, "11 events posted");
  assert(all.body.every((e: { ts: string }, i: number, a: { ts: string }[]) => i === 0 || a[i - 1].ts <= e.ts), "oldest first");
  const last = all.body[all.body.length - 1];
  assert.equal((await get(`since=${encodeURIComponent(last.ts)}`)).body.length, 0, "nothing after the last one");
  // Two events can land in the same or the next millisecond: count what the cursor should return instead of assuming 1.
  const cut = new Date(last.ts).getTime() - 1;
  const want = all.body.filter((e: { ts: string }) => new Date(e.ts).getTime() > cut).length;
  assert.equal((await get(`since=${cut}`)).body.length, want, "epoch ms works");
  assert.equal((await get("limit=3")).body.length, 3);
  assert.equal((await get("since=yesterday")).status, 400); assert.equal((await get("limit=9999")).status, 400);
  assert(all.body.some((e: { status: string; result?: { recordIds: string[] } }) => e.status === "merged" && e.result?.recordIds.length));
  ok("GET /api/events?since: oldest first, ISO or epoch ms, limit, 400 on bad input, shows status and result");
  const first = all.body.find((e: { dedupeKey?: string }) => e.dedupeKey === "check:cp1:demo-antakya-001");
  assert(tweets[0].text.includes("000 000 00 42"), "the demo tweet carries a (fake) phone number");
  assert(!first.payload.text.includes("000 000 00 42") && first.payload.text.includes("•••••••••42"), "feed masks it");
  const stored = await c.events.findOne({ dedupeKey: "check:cp1:demo-antakya-001" });
  assert(stored!.payload && (stored!.payload as { text: string }).text.includes("000 000 00 42"), "stored text unchanged");
  ok("feed masks phone numbers on the way out (•••••••••42); the stored event keeps the original");

  // ================= CP2: the dispatcher, and every event a person sends =================
  const say = async <P>(key: string, type: EventType, actor: string, payload: P) => {
    await post<P>({ deskId: DESK, type, source: "person", actor, dedupeKey: `check:cp2:${key}`, payload });
    await drain();
    return (await c.events.findOne({ dedupeKey: `check:cp2:${key}` }))!;
  };
  const taskOf = async (q: Partial<Task>) => (await c.tasks.findOne({ deskId: DESK, ...q }))!;
  const inboxOf = (userId: string, taskId: string) => c.inbox.find({ userId, taskId }).toArray();
  const sum = (parts: { value: number }[] = []) => parts.reduce((n, p) => n + p.value, 0);

  // --- a report becomes a site and a call task ---
  await report("cp2-a", {
    kind: "trapped", text: "Yardım, 2 kişi enkaz altında, tel 0532 111 22 33", textEn: "Help, 2 people under rubble, phone 0532 111 22 33",
    coords: SITE_A, region: "antakya-merkez", peopleCount: 2,
  });
  await drain();
  const siteA = (await c.sites.findOne({ deskId: DESK, coords: SITE_A }))!;
  assert(siteA, "site A was not made");
  const allSites = await c.sites.find({ deskId: DESK }).toArray();
  assert(allSites.every((s) => (s.caseNo ?? 0) > 0), "every site has a case number");
  assert.equal(new Set(allSites.map((s) => s.caseNo)).size, allSites.length, "case numbers are unique on the desk");
  assert.equal(siteA.posts?.length, 1);
  assert(!siteA.posts![0].text.includes("0532 111 22 33") && siteA.posts![0].text.includes("•••••••••33"), "post text is masked");
  assert.equal(siteA.supporters?.length, siteA.support, "support is the number of supporters");
  assert(allSites.every((s) => sum(s.scoreParts) === s.priority), "score parts add up to the priority on every site");
  const ayseNow = allSites.find((s) => s._id === ayse._id)!;
  assert.equal(ayseNow.posts?.length, 5, "Ayşe had 6 posts, the latest 5 are kept");
  assert(ayseNow.supporters!.every((k) => k.length < 40), `supporters are short keys, never post text: ${ayseNow.supporters}`);
  ok(`site A is case ${siteA.caseNo}, its post masked, ${siteA.supporters?.length} supporter, score parts add up to ${siteA.priority}`);

  const callA = await taskOf({ recordId: siteA._id, type: "call", open: true });
  assert(callA, "no call task for site A. Is a Brain running older code on this database? It may have taken the report");
  assert.equal(callA.status, "assigned"); assert.equal(callA.risk, "low");
  assert.equal(callA.assignee, U.volA, "the nearest volunteer seen lately, not the closer one who went quiet");
  assert.equal(sum(callA.scoreParts), callA.priority);
  assert.equal((await inboxOf(U.volA, callA._id)).filter((i) => i.kind === "task").length, 1, "one inbox item for the assignee");
  ok(`call task ${callA._id} straight to ${U.volA} (the closer one went quiet 10 min ago), one inbox item`);

  // --- accept, a wrong person, done ---
  let ev = await say("a-accept", "answer", U.volA, { taskId: callA._id, result: "accepted", etaMinutes: 5 });
  assert.equal(ev.status, "done", ev.result?.reason);
  let t = await taskOf({ _id: callA._id });
  assert.equal(t.status, "accepted"); assert(t.eta && t.eta > new Date());
  assert.equal((await c.sites.findOne({ _id: siteA._id }))!.callStatus, "called");
  ev = await say("a-wrong", "answer", U.volB, { taskId: callA._id, result: "done" });
  assert.equal(ev.status, "rejected");
  ok(`accept: task accepted with an ETA, site called. Someone else answering: rejected ("${ev.result?.reason}")`);

  ev = await say("a-done", "answer", U.volA, { taskId: callA._id, result: "done", note: "voices heard" });
  t = await taskOf({ _id: callA._id });
  assert.equal(t.status, "done"); assert.equal(t.open, false);
  let site = (await c.sites.findOne({ _id: siteA._id }))!;
  assert.equal(site.callStatus, "verified"); assert.equal(site.confidence, "confirmed");
  const rescue = await taskOf({ recordId: siteA._id, type: "rescue", open: true });
  assert(rescue, "verified with 2 trapped: a rescue task");
  assert.equal(rescue.status, "waiting_approval"); assert.equal(rescue.risk, "high"); assert.equal(rescue.assignee, undefined);
  assert(rescue.detail.includes(`(${U.field1})`), `the proposed team is named: ${rescue.detail}`);
  for (const coord of [U.coord1, U.coord2]) {
    assert.equal((await inboxOf(coord, rescue._id)).filter((i) => i.kind === "approval").length, 1, `one approval for ${coord}`);
  }
  ok(`done: call task closed, site verified and confirmed, rescue waits for approval ("${rescue.detail}"), one approval per coordinator`);

  // --- approval: not a coordinator, Modify with an assignee, too late ---
  ev = await say("a-approve-vol", "approval", U.volA, { taskId: rescue._id, approved: true });
  assert.equal(ev.status, "rejected");
  ev = await say("a-approve", "approval", U.coord1, { taskId: rescue._id, approved: true, assignee: U.field2 });
  assert.equal(ev.status, "done", ev.result?.reason);
  t = await taskOf({ _id: rescue._id });
  assert.equal(t.status, "assigned"); assert.equal(t.assignee, U.field2, "the coordinator's pick, not the proposal");
  assert.equal((await inboxOf(U.field2, rescue._id)).filter((i) => i.kind === "task").length, 1);
  ev = await say("a-approve-again", "approval", U.coord2, { taskId: rescue._id, approved: true });
  assert.equal(ev.status, "rejected"); assert.match(ev.result!.reason, /not waiting for approval/);
  ok(`approval with an assignee: ${U.field2} gets it and an inbox item. A volunteer approving, or a second approval: rejected`);

  // --- arrived, then done ---
  await say("a-arrived", "answer", U.field2, { taskId: rescue._id, result: "accepted", progress: "arrived" });
  t = await taskOf({ _id: rescue._id });
  assert.equal(t.status, "accepted"); assert.equal(t.progress, "arrived");
  assert.equal((await c.sites.findOne({ _id: siteA._id }))!.status, "team_on_site");
  ok("arrived: task progress arrived, site team on site (D7)");
  await say("a-rescued", "answer", U.field2, { taskId: rescue._id, result: "done" });
  site = (await c.sites.findOne({ _id: siteA._id }))!;
  assert.equal(site.status, "closed"); assert.equal((await taskOf({ _id: rescue._id })).open, false);
  ok("rescue done: site closed");

  // --- decline: same task, next person, never the same one twice ---
  await report("cp2-b", { kind: "trapped", text: "Enkaz, bir kişi", textEn: "Rubble, one person", coords: SITE_B, region: "antakya-merkez", peopleCount: 1 });
  await drain();
  const siteB = (await c.sites.findOne({ deskId: DESK, coords: SITE_B }))!;
  const callB = await taskOf({ recordId: siteB._id, type: "call", open: true });
  assert(callB, "no call task for site B");
  assert.equal(callB.assignee, U.volA);
  await say("b-decline", "answer", U.volA, { taskId: callB._id, result: "declined", note: "no signal here" });
  t = await taskOf({ _id: callB._id });
  assert.equal(t.status, "assigned"); assert.deepEqual(t.tried, [U.volA]);
  assert(t.assignee && t.assignee !== U.volA && t.assignee !== U.volStale, `reassigned to ${t.assignee}`);
  assert.equal((await inboxOf(t.assignee, callB._id)).length, 1);
  ev = await say("b-again", "answer", U.volA, { taskId: callB._id, result: "accepted" });
  assert.equal(ev.status, "rejected");
  ok(`decline: the same task goes to ${t.assignee}, tried [${t.tried}], the first person can no longer answer it`);

  // --- incident: the person cannot go on, the task is blocked, a replacement goes out ---
  const second = t.assignee!;
  await say("b-accept", "answer", second, { taskId: callB._id, result: "accepted", etaMinutes: 10 });
  ev = await say("b-incident", "incident", second, {
    kind: "vehicle_breakdown", text: "Lastik patladı", textEn: "Flat tire, I cannot move", taskId: callB._id, canContinue: false,
  });
  assert.equal(ev.status, "done", ev.result?.reason);
  const old = await taskOf({ _id: callB._id });
  const inc = (await c.incidents.findOne({ deskId: DESK, taskId: callB._id }))!;
  assert.equal(old.status, "blocked"); assert.equal(old.open, false); assert.equal(old.blockedBy, inc._id);
  const repl = await taskOf({ replaces: callB._id });
  assert(repl, "a replacement task");
  assert.equal(repl.open, true); assert.deepEqual(repl.tried, [U.volA, second]);
  assert(repl.assignee ? !repl.tried.includes(repl.assignee) : repl.status === "escalated", "the replacement never goes back to someone who tried");
  assert.equal(inc.severity, "high"); assert((inc.caseNo ?? 0) > 0);
  // helping only when every step found someone: the replacement, and the helper (nobody here has a mechanic skill or a vehicle)
  const helper = await c.tasks.findOne({ recordType: "incident", recordId: inc._id, type: "assist" });
  assert.equal(inc.status, repl.status === "assigned" && helper && helper.status !== "escalated" ? "helping" : "escalated");
  for (const coord of [U.coord1, U.coord2]) {
    assert.equal((await c.inbox.countDocuments({ userId: coord, incidentId: inc._id, kind: "incident" })), 1);
  }
  ok(`incident ${inc.caseNo}: task blocked, replacement ${repl.status}${repl.assignee ? ` to ${repl.assignee}` : ""}, incident ${inc.status}, both coordinators told`);
  ev = await say("b-resolved", "incident", second, { incidentId: inc._id, kind: "vehicle_breakdown", text: "ok", textEn: "Tire changed", canContinue: true, resolved: true });
  assert.equal(ev.status, "merged"); assert.equal((await c.incidents.findOne({ _id: inc._id }))!.status, "resolved");
  ok("incident update: resolved");

  // --- a need, and a claim ---
  ev = await say("need", "need", U.field1, { item: "Blankets", quantity: 20, lifeThreatening: true, siteId: siteB._id });
  assert.equal(ev.status, "done", ev.result?.reason);
  let need = (await c.needs.findOne({ deskId: DESK }))!;
  const deliver = await taskOf({ recordId: need._id, type: "deliver", open: true });
  assert(deliver, "an open need gets a deliver task");
  assert.equal(deliver.assignee, U.supplier, "the supplier with blankets in stock"); assert.equal(deliver.risk, "low");
  need = (await c.needs.findOne({ _id: need._id }))!;
  assert.equal(need.status, "assigned"); assert((need.caseNo ?? 0) > 0); assert.equal(sum(need.scoreParts), need.priority);
  ev = await say("need-again", "need", U.field2, { item: "blankets", quantity: 10, lifeThreatening: false, region: "antakya-merkez" });
  assert.equal(ev.status, "merged");
  need = (await c.needs.findOne({ _id: need._id }))!;
  assert.equal(need.quantity, 30); assert.equal(need.support, 2); assert.equal(await c.needs.countDocuments({ deskId: DESK }), 1);
  ok(`need: case ${need.caseNo}, deliver task to ${U.supplier}, a second ask in the region merges (30 blankets, 2 people)`);

  ev = await say("claim", "claim", U.volA, { what: "assist", text: "yoldayım", textEn: "I am bringing a jack", recordId: siteB._id, etaMinutes: 15 });
  assert.equal(ev.status, "merged", ev.result?.reason);
  const assist = await taskOf({ recordId: siteB._id, type: "assist", open: true });
  assert.equal(assist.assignee, U.volA); assert.equal(assist.status, "accepted");
  ev = await say("claim-none", "claim", U.volA, { what: "deliver", text: "su", textEn: "water to the school" });
  assert.equal(ev.status, "rejected");
  ok(`claim: an accepted assist task for ${U.volA}. A claim that names nothing: rejected with a reason`);


  // --- D-0017: origin block (SRC-3) and AP as vetted (SRC-4) ---
  // Far from every other case above (about 60 km), so nothing here merges into an earlier site.
  const sourceOf = async (siteId: string) => (await c.sites.findOne({ _id: siteId }))!;
  const strip = ({ _id, coords, sources, history, caseNo, observedAt, address, posts, supporters, ...rest }: Site) => rest; // eslint-disable-line @typescript-eslint/no-unused-vars
  const origin: EventOrigin = {
    postId: "1622018840000000101", author: "@hatay_dayanisma", kind: "post",
    url: "https://x.example/hatay_dayanisma/status/1622018840000000101", metrics: { reposts: 412 },
    media: [{ type: "image", url: "/demo/shelter-whiteboard-2.jpg" }],
  };
  const o1 = await post<ReportPayload>({
    deskId: DESK, type: "report", source: "x", actor: "x-agent", dedupeKey: "check:cp1:origin-with", origin,
    payload: { kind: "trapped", text: "Origin check A: enkaz altında 3 kişi", textEn: "Origin check: 3 under rubble", coords: [36.7, 36.7], region: "antakya-merkez", peopleCount: 3 },
  });
  const o2 = await post<ReportPayload>({
    deskId: DESK, type: "report", source: "x", actor: "x-agent", dedupeKey: "check:cp1:origin-without",
    payload: { kind: "trapped", text: "Origin check B: enkaz altında 3 kişi", textEn: "Origin check: 3 under rubble", coords: [36.75, 36.75], region: "antakya-merkez", peopleCount: 3 },
  });
  await drain();
  const ev1 = (await c.events.findOne({ _id: o1 }))!, ev2 = (await c.events.findOne({ _id: o2 }))!;
  assert.deepEqual(ev1.origin, origin, "the origin is stored on the event as sent");
  assert.equal(ev2.origin, undefined, "no origin sent, none stored");
  ok("SRC-3 (a): origin stored deep-equal on the event");
  const s1 = await c.sites.findOne({ "sources.eventId": o1 }), s2 = await c.sites.findOne({ "sources.eventId": o2 });
  assert(s1 && s2 && s1._id !== s2._id);
  assert.deepEqual(strip(await sourceOf(s1._id)), strip(await sourceOf(s2._id)), "origin changes no site field");
  ok("SRC-3 (b): the same report with and without origin gives identical site fields");

  const envelope = (originBlock: unknown) => eventBody.safeParse({
    type: "report", source: "x", observedAt: "2023-02-06T01:58:00Z", origin: originBlock,
    payload: { kind: "trapped", text: "t", textEn: "t" },
  });
  assert(envelope(origin).success, "a full origin is accepted");
  assert(envelope({ kind: "wire", slug: "BC-EU--Turkey-Earthquake", urgency: "urgent" }).success, "AP origin is accepted");
  assert(!envelope({ url: "javascript:alert(1)" }).success, "javascript: url");
  assert(!envelope({ url: "data:text/html,x" }).success, "data: url");
  assert(!envelope({ kind: "tweet" }).success, "unknown kind");
  assert(!envelope({ postId: "1", extra: true }).success, "extra key");
  assert(!envelope({ postId: "x".repeat(201) }).success, "oversize postId");
  assert(!envelope({ author: "x".repeat(201) }).success, "oversize author");
  assert(!envelope({ slug: "x".repeat(201) }).success, "oversize slug");
  assert(!envelope({ url: `https://x.example/${"a".repeat(2000)}` }).success, "oversize url");
  assert(!envelope({ media: Array.from({ length: 11 }, () => ({ type: "image", url: "/demo/a.jpg" })) }).success, "11 media");
  assert(!envelope({ metrics: Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`m${i}`, 1])) }).success, "11 metrics");
  assert(!envelope({ metrics: { reposts: -1 } }).success, "negative metric");
  assert(!envelope({ metrics: { reposts: 1.5 } }).success, "fractional metric");
  assert(envelope({ media: [{ type: "image", url: "/demo/x.jpg" }] }).success, "same-site media path");
  assert(envelope({ media: [{ type: "video", url: "https://cdn.example/x.mp4" }] }).success, "https media");
  assert(!envelope({ media: [{ type: "image", url: "//evil.com/x.jpg" }] }).success, "protocol-relative media url");
  assert(!envelope({ media: [{ type: "image", url: "/\\evil.com/x.jpg" }] }).success, "backslash protocol-relative media url");
  {
    const masked = maskEvent({ type: "report", payload: {}, origin: { author: "call 0555 123 45 67", postId: "1" } } as unknown as Event);
    assert(!/0555 123 45 67/.test(JSON.stringify(masked.origin)), "the feed masks phone numbers inside origin");
  }
  assert(!envelope({ media: [{ type: "image", url: "javascript:alert(1)" }] }).success, "javascript: media url");
  assert(!envelope({ media: [{ type: "audio", url: "/demo/x.mp3" }] }).success, "unknown media type");
  ok("SRC-3 (c): the schema rejects javascript: urls, unknown kinds, extra keys and oversize fields; accepts /demo/x.jpg, rejects //evil.com");

  const rulesDir = new URL("./rules/", import.meta.url);
  for (const f of (await readdir(rulesDir)).filter((n) => n.endsWith(".ts"))) {
    assert(!/\borigin\b/.test(await readFile(new URL(f, rulesDir), "utf8")), `lib/rules/${f} must not read event.origin`);
  }
  ok("SRC-3 (d): no file in lib/rules/ mentions origin");

  // SRC-4 (a): a public closure is confirmed by AP on the same road.
  const roadBody = { road: "Origin Check Caddesi", reason: "bridge down", coords: [36.8, 36.8] as LatLng };
  await post({ deskId: DESK, type: "closure", source: "x", actor: "x-agent", dedupeKey: "check:cp1:ap-road-x", payload: { ...roadBody, state: "closed" } });
  await drain();
  let road = (await c.roads.findOne({ deskId: DESK, road: roadBody.road }))!;
  assert.equal(road.state, "closed"); assert.equal(road.confidence, "unconfirmed"); assert.equal(road.trust, "public");
  await post({ deskId: DESK, type: "closure", source: "news", actor: "ap", dedupeKey: "check:cp1:ap-road-ap",
    origin: { kind: "wire", slug: "BC-EU--Turkey-Earthquake", urgency: "urgent" }, payload: { ...roadBody, state: "closed" } });
  await drain();
  road = (await c.roads.findOne({ _id: road._id }))!;
  assert.equal(road.state, "closed"); assert.equal(road.confidence, "confirmed"); assert.equal(road.trust, "vetted");
  ok("SRC-4 (a): a public closure is unconfirmed, then an AP closure makes it closed and confirmed (vetted)");

  // SRC-4 (b)/(d): an AP need opens alone, a public x need stays proposed.
  const needEv = (source: "news" | "x", actor: string, key: string, item: string) =>
    post({ deskId: DESK, type: "need", source, actor, dedupeKey: `check:cp1:${key}`, payload: { item, quantity: 5, lifeThreatening: false, region: "hatay-ap-check" } });
  await needEv("news", "ap", "ap-need", "Insulin");
  await needEv("x", "x-agent", "x-need", "Kerosene stoves");
  await drain();
  const apNeed = (await c.needs.findOne({ deskId: DESK, item: "Insulin" }))!;
  const xNeed = (await c.needs.findOne({ deskId: DESK, item: "Kerosene stoves" }))!;
  assert.notEqual(apNeed.status, "proposed", "one AP post opens a need on its own"); assert.equal(apNeed.confidence, "confirmed");
  ok(`SRC-4 (b): one AP need opens alone (${apNeed.status}, confirmed)`);
  assert.equal(xNeed.status, "proposed"); assert.equal(xNeed.confidence, "unconfirmed");
  ok("SRC-4 (d): control, a public x need stays proposed");

  // SRC-4 (c): AP is one voice, whatever the text.
  for (const [i, t] of ["AP: first dispatch on the Cebrail collapse", "AP: second dispatch, rescuers on site"].entries()) {
    await post<ReportPayload>({ deskId: DESK, type: "report", source: "news", actor: "ap", dedupeKey: `check:cp1:ap-voice-${i}`,
      payload: { kind: "trapped", text: t, textEn: t, coords: [36.9, 36.9], region: "antakya-merkez", peopleCount: 2 } });
  }
  await drain();
  const apSite = (await c.sites.find({ deskId: DESK, "sources.source": "news", coords: [36.9, 36.9] }).toArray());
  assert.equal(apSite.length, 1); assert.equal(apSite[0].sources.length, 2);
  assert.deepEqual(apSite[0].supporters, ["news:ap"]); assert.equal(apSite[0].support, 1);
  ok("SRC-4 (c): two AP posts with different texts are one voice (news:ap)");

  // --- TRUST-1 (#56): a public rescued post never lowers peopleTrapped ---
  const R: LatLng = [37.1, 37.1];
  const rescuedText = (n: string) => ({ kind: "rescued" as const, text: `Rescued ${n}`, textEn: `Rescued ${n}`, coords: R, peopleCount: 1 });
  await post<ReportPayload>({ deskId: DESK, type: "report", source: "x", actor: "x-agent", dedupeKey: "check:cp1:t1-trapped",
    payload: { kind: "trapped", text: "Trust check: 4 people under the rubble", textEn: "Trust check: 4 trapped", coords: R, region: "antakya-merkez", peopleCount: 4 } });
  await drain();
  const t1 = (await c.sites.findOne({ deskId: DESK, coords: R }))!;
  assert.equal(t1.peopleTrapped, 4);
  for (const src of ["x", "instagram", "facebook"] as const) {
    await post<ReportPayload>({ deskId: DESK, type: "report", source: src, actor: `${src}-agent`, dedupeKey: `check:cp1:t1-pub-${src}`, payload: rescuedText(src) });
  }
  await drain();
  const t2 = (await c.sites.findOne({ _id: t1._id }))!;
  assert.equal(t2.peopleTrapped, 4, "public rescued posts do not lower peopleTrapped");
  assert.equal(t2.tier, t1.tier); assert.equal(t2.status, t1.status);
  assert.equal(t2.sources.length, t1.sources.length + 3, "the public posts are still recorded as sources");
  ok("TRUST-1: public x, instagram and facebook rescued posts leave peopleTrapped 4, tier and status unchanged, and are recorded as sources");
  // Control: a vetted voice (AP) and a person still lower it.
  await post<ReportPayload>({ deskId: DESK, type: "report", source: "news", actor: "ap", dedupeKey: "check:cp1:t1-ap", payload: rescuedText("ap") });
  await drain();
  assert.equal((await c.sites.findOne({ _id: t1._id }))!.peopleTrapped, 3, "a vetted rescued report lowers it");
  await post<ReportPayload>({ deskId: DESK, type: "report", source: "person", actor: U.volA, dedupeKey: "check:cp1:t1-person", payload: rescuedText("person") });
  await drain();
  assert.equal((await c.sites.findOne({ _id: t1._id }))!.peopleTrapped, 2, "a person's rescued report lowers it");
  ok("TRUST-1 control: a vetted (AP) and a person's rescued report still lower peopleTrapped");
  // Order must not matter: after trusted voices have changed the count, a public post still cannot.
  await post<ReportPayload>({ deskId: DESK, type: "report", source: "x", actor: "x-agent", dedupeKey: "check:cp1:t1-pub-late", payload: rescuedText("late x") });
  await drain();
  const t3 = (await c.sites.findOne({ _id: t1._id }))!;
  assert.equal(t3.peopleTrapped, 2, "a late public rescued post does not lower peopleTrapped either");
  ok("TRUST-1: a public rescued post after trusted ones still changes nothing");

  // --- DEMO-4: the Brain's ages and stamps are in scenario time while a demo plays ---
  // startedAt is 10 real seconds ago, 1800 s long: 72x, so the scenario clock reads T0 + 720 s.
  savedDemo = await c.meta.findOne({ _id: "demo" });
  const R0 = Date.now();
  const doc = { state: "playing" as const, runId: "check-demo-4", startedAt: new Date(R0 - 10_000), durationS: 1800 };
  await c.meta.replaceOne({ _id: "demo" }, doc, { upsert: true });
  await getDemo({ fresh: true });
  const T0 = demoT0();
  assert.equal(demoNowFrom(doc, R0).getTime() - T0, 720_000, "10 real seconds at 72x are 720 scenario seconds");
  const D: LatLng = [37.3, 37.3];
  await post<ReportPayload>({ deskId: DESK, type: "report", source: "person", actor: U.volA, dedupeKey: "check:cp1:demo4-site",
    payload: { kind: "trapped", text: "Demo clock check: 2 people under the rubble", textEn: "Demo clock check: 2 trapped", coords: D, region: "antakya-merkez", peopleCount: 2 } });
  await drain();
  const ds = (await c.sites.findOne({ deskId: DESK, coords: D }))!;
  // The event came in just now (event.ts is real and stays real). The site's times are scenario times.
  const evTs = (await c.events.findOne({ deskId: DESK, dedupeKey: "check:cp1:demo4-site" }))!.ts;
  assert(Math.abs(evTs.getTime() - R0) < 20_000, "event.ts stays on the real clock");
  const sinceT0 = (d: Date) => (new Date(d).getTime() - T0) / 1000;
  assert(sinceT0(ds.observedAt) >= 715 && sinceT0(ds.observedAt) < 2400, `observedAt is scenario time, T0 + ${sinceT0(ds.observedAt)} s`);
  assert(ds.history.every((h) => sinceT0(h.ts) >= 715 && sinceT0(h.ts) < 2400), "history lines are on the demo clock");
  const dt = await c.tasks.find({ recordId: ds._id }).toArray();
  assert(dt.length >= 1, "the dispatcher made a task");
  assert(dt.every((t) => sinceT0(t.deadline) >= 715 + 60 && sinceT0(t.deadline) < 2400 + 3600), "task deadlines are on the demo clock");
  assert(dt.every((t) => t.history.every((h) => sinceT0(h.ts) >= 715 && sinceT0(h.ts) < 2400)), "task history is on the demo clock");
  ok(`DEMO-4: a report at 72x is stamped T0 + ${Math.round(sinceT0(ds.observedAt))} s, its task deadline T0 + ${Math.round(sinceT0(dt[0].deadline))} s (event.ts stays real)`);
  // Age is measured in scenario time: 30 real seconds later the site has waited about 36 scenario minutes.
  const later = demoNowFrom(doc, R0 + 30_000);
  const changed = await refreshPriorities(later, DESK);
  const waiting = changed.find((x) => x.recordId === ds._id)?.scoreParts.find((p) => p.name === "waiting")?.value;
  const wantMin = Math.floor((later.getTime() - new Date(ds.observedAt).getTime()) / 60_000);
  assert(wantMin >= 25 && wantMin <= 60, `${wantMin} scenario minutes`);
  assert.equal(waiting, wantMin, "the waiting part of the score counts scenario minutes");
  ok(`DEMO-4: 30 real seconds later the site has waited ${wantMin} scenario minutes (score part "waiting" = ${waiting})`);
  // Control: with no demo document the same report is stamped on the real clock.
  await restoreDemo();
  const D2: LatLng = [37.31, 37.31];
  await post<ReportPayload>({ deskId: DESK, type: "report", source: "person", actor: U.volA, dedupeKey: "check:cp1:demo4-control",
    payload: { kind: "trapped", text: "Demo clock control: 1 person under the rubble", textEn: "Demo clock control: 1 trapped", coords: D2, region: "antakya-merkez", peopleCount: 1 } });
  await drain();
  const dc = (await c.sites.findOne({ deskId: DESK, coords: D2 }))!;
  assert(Math.abs(new Date(dc.observedAt).getTime() - Date.now()) < 20_000, "no demo document: observedAt is real time");
  assert(dc.history.every((h) => Math.abs(new Date(h.ts).getTime() - Date.now()) < 20_000), "no demo document: history is real time");
  ok("DEMO-4 control: with no demo document the stamps are real time");

  const pending = await c.events.countDocuments({ deskId: DESK, status: { $in: ["pending", "working"] } });
  assert.equal(pending, 0, "nothing left pending");
  ok("every event on the desk ended done, merged or rejected");

  console.log(`\nAll ${passed} checks passed.`);
}

main()
  .catch((err) => { console.error("\nFAILED:", err instanceof Error ? err.message : err); process.exitCode = 1; })
  .finally(async () => { await cleanup(); await restoreDemo().catch(() => undefined); await closeDb(); });
