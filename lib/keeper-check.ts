// CP1 check for the memory keeper: npm run keeper:check
// Replays the five demo tweets (data/tweets_replay.json) plus edge cases into a separate desk,
// "check-cp1", runs the Brain on that desk only, checks the sites, then deletes everything it
// made. The shared board (malatya-2023) is not touched. Also checks GET /api/events?since=.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { GET as feed } from "../app/api/events/route";
import { processEvent, runOnce } from "../workers/brain";
import { closeDb, cols, getBoard, postEvent } from "./db";
import type { LatLng, ReportPayload, Site } from "./types";

const DESK = "check-cp1";
let passed = 0;
const ok = (msg: string) => { passed++; console.log(`ok  ${msg}`); };

async function drain() {
  // Process this desk's events. If a real Brain is running it may take some; wait for those too.
  const { events } = await cols();
  for (let i = 0; i < 200; i++) {
    if (await runOnce({ deskId: DESK })) continue;
    if (!(await events.countDocuments({ deskId: DESK, status: { $in: ["pending", "working"] }, type: "report" }))) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("events did not finish");
}

const report = (key: string, p: ReportPayload, actor = "x-agent", source: "x" | "person" = "x") =>
  postEvent<ReportPayload>({ deskId: DESK, type: "report", source, actor, dedupeKey: `check:cp1:${key}`, payload: p });

async function cleanup() {
  const c = await cols();
  await c.events.deleteMany({ deskId: DESK });
  await c.sites.deleteMany({ deskId: DESK });
}

async function main() {
  await cleanup();
  const c = await cols();
  assert(await c.users.findOne({ _id: "field-alpha" }), "run npm run db:seed first");
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
  const ayse = sites.find((s) => s.sources.some((x) => x.eventId) && s.coords?.[1] === 38.31) as Site;
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
  await report("rescued", { kind: "rescued", text: "Ayşe çıkarıldı", textEn: "Ayşe was taken out", coords: [38.3501, 38.3101], peopleCount: 1 },
    "field-alpha", "person");
  await report("orphan-update", { kind: "site_update", text: "far away", textEn: "far away", coords: [39.9, 32.8] });
  await postEvent({ deskId: DESK, type: "report", source: "x", actor: "x-agent", dedupeKey: "check:cp1:bad", payload: { kind: "nonsense" } });
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
  const again = await c.events.findOne({ dedupeKey: "check:cp1:demo-malatya-002" });
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
  assert.equal((await get(`since=${new Date(last.ts).getTime() - 1}`)).body.length, 1, "epoch ms works");
  assert.equal((await get("limit=3")).body.length, 3);
  assert.equal((await get("since=yesterday")).status, 400); assert.equal((await get("limit=9999")).status, 400);
  assert(all.body.some((e: { status: string; result?: { recordIds: string[] } }) => e.status === "merged" && e.result?.recordIds.length));
  ok("GET /api/events?since: oldest first, ISO or epoch ms, limit, 400 on bad input, shows status and result");
  const first = all.body.find((e: { dedupeKey?: string }) => e.dedupeKey === "check:cp1:demo-malatya-001");
  assert(tweets[0].text.includes("000 000 00 42"), "the demo tweet carries a (fake) phone number");
  assert(!first.payload.text.includes("000 000 00 42") && first.payload.text.includes("•••••••••42"), "feed masks it");
  const stored = await c.events.findOne({ dedupeKey: "check:cp1:demo-malatya-001" });
  assert(stored!.payload && (stored!.payload as { text: string }).text.includes("000 000 00 42"), "stored text unchanged");
  ok("feed masks phone numbers on the way out (•••••••••42); the stored event keeps the original");

  console.log(`\nAll ${passed} checks passed.`);
}

main()
  .catch((err) => { console.error("\nFAILED:", err instanceof Error ? err.message : err); process.exitCode = 1; })
  .finally(async () => { await cleanup(); await closeDb(); });
