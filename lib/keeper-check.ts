// CP1 and CP2 check for the Brain: npm run keeper:check
// Replays the five demo tweets (data/tweets_replay.json) plus edge cases into a separate desk,
// "check-cp1", runs the Brain on that desk only, checks the sites, then deletes everything it
// made. The shared board (antakya-2023) is not touched. Also checks GET /api/events?since=.
// CP2: throwaway people on the same desk, then a report becomes a site and a call task, an
// accept, a done, an approval with an assignee, an arrived, a decline, an incident that blocks
// a task, a need and a claim.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { GET as feed } from "../app/api/events/route";
import { processEvent } from "../workers/brain";
import { closeDb, cols, getBoard, newId } from "./db";
import type { Event, EventType, LatLng, NewEvent, ReportPayload, Site, Task, User } from "./types";

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

async function cleanup() {
  const c = await cols();
  await c.inbox.deleteMany({ userId: { $in: Object.values(U) } });
  await Promise.all([
    c.events.deleteMany({ deskId: DESK }), c.sites.deleteMany({ deskId: DESK }), c.needs.deleteMany({ deskId: DESK }),
    c.incidents.deleteMany({ deskId: DESK }), c.tasks.deleteMany({ deskId: DESK }), c.users.deleteMany({ deskId: DESK }),
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
  const tweets = JSON.parse(await readFile(new URL("../data/tweets_replay.json", import.meta.url), "utf8")) as
    { id: string; text: string; coords: LatLng; region: string }[];
  for (const t of tweets) {
    const two = t.text.includes("iki kişi");
    await report(t.id, { kind: "trapped", text: t.text, textEn: t.text, coords: t.coords, region: t.region, peopleCount: two ? 2 : 1 });
  }
  await drain();

  let sites = await c.sites.find({ deskId: DESK }).toArray();
  const ayse = sites.find((s) => s.sources.some((x) => x.eventId) && s.coords?.[1] === 36.157) as Site;
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

  const pending = await c.events.countDocuments({ deskId: DESK, status: { $in: ["pending", "working"] } });
  assert.equal(pending, 0, "nothing left pending");
  ok("every event on the desk ended done, merged or rejected");

  console.log(`\nAll ${passed} checks passed.`);
}

main()
  .catch((err) => { console.error("\nFAILED:", err instanceof Error ? err.message : err); process.exitCode = 1; })
  .finally(async () => { await cleanup(); await closeDb(); });
