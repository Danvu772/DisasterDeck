// Simulated feeds: streams the constant-change inputs into the desk on a loop, for now.
// Every channel is simulated. No model call, no network, no key, no cost. The real agents
// (X, news, sheet, quake) come back when the agentic layers are integrated.
//
//   x       the replay tweets, mock extraction: reports, needs, road closures, shelter counts
//   sheet   random small changes to shelter bed counts, as the shelter sheet would send them
//   news    road closures toggled open and closed, as news would report them
//   busy    a volunteer on screen with fewer than BUSY_MIN open tasks gets a fresh trapped report
//           near them, so a demo desk always has a next task. It goes through the keeper and the
//           dispatcher like any report, nothing here writes a task.
//
// Each event says who sent it: actor "synthetic-feed", "synthetic-sheet" or "synthetic-news".
// The records are real records on the desk, so a simulated change moves real sites, roads and
// shelters on the board. Fresh dedupe keys (`:synth:<cycle>`) make each pass a new event.
//
//   npx tsx --env-file=.env.local workers/synthetic-feed.ts                 every 30 s, all channels
//   npx tsx --env-file=.env.local workers/synthetic-feed.ts --once          one pass, then exit
//   SYNTH_EVERY_S=10 npx tsx --env-file=.env.local workers/synthetic-feed.ts
import { desk, type NewEvent } from "../agents/desk";
import { extractTweet } from "../agents/research/x-extract";
import { readReplay, replayKey } from "../agents/research/replay-input";
import { haversineMeters } from "../lib/geo";
import { eventBody } from "../lib/schemas";
import type { LatLng } from "../lib/types";

const TWEETS = "data/tweets_replay.json";
const EVERY_MS = Number(process.env.SYNTH_EVERY_S ?? 30) * 1000;
const deskId = process.env.DESK_ID ?? "malatya-2023";
const once = process.argv.includes("--once");
// Keys carry this run's id. The pass counter restarts at 0 on every start, and without the id a restart
// reuses the keys of the last run: postEvent dedupes them to the old events and nothing new is written.
const RUN = Date.now().toString(36);
const log = (...m: unknown[]) => console.log(`[synthetic-feed ${new Date().toISOString().slice(11, 19)}]`, ...m);

type Port = ReturnType<typeof desk>;

const BUSY_MIN = 2;
const SEEN_MS = 3 * 60_000;
// One report per person per minute at most, so a task that cannot reach them does not flood the desk.
const BUSY_COOLDOWN_MS = 60_000;
const STREETS = ["Çınar Sokak", "Kayısı Caddesi", "Fırat Sokak", "Gündüz Sokak", "Meydan Sokak", "Bahar Sokak", "Pınar Sokak", "Yeni Mahalle Sokak"];
const lastBusy = new Map<string, number>();
let busyN = 0;

async function post(d: Port, event: NewEvent): Promise<string> {
  eventBody.parse(event);
  return d.postEvent(event);
}

async function xPass(d: Port, cycle: number, tweets: ReturnType<typeof readReplay>): Promise<void> {
  const t = tweets[cycle % tweets.length];
  const x = await extractTweet(t, { mock: true });
  const base = { deskId, source: "x" as const, actor: "synthetic-feed", observedAt: new Date().toISOString() };
  const key = `${replayKey(t, deskId)}:synth:${RUN}:${cycle}`;
  let n = 0;
  if (x.report) { await post(d, { ...base, type: "report", dedupeKey: key, payload: x.report }); n++; }
  for (const [i, nd] of x.needs.entries()) { await post(d, { ...base, type: "need", dedupeKey: `${key}:need:${i}`, payload: nd }); n++; }
  for (const [i, c] of x.closures.entries()) { await post(d, { ...base, type: "closure", dedupeKey: `${key}:closure:${i}`, payload: c }); n++; }
  for (const [i, c] of x.capacities.entries()) { await post(d, { ...base, type: "capacity", dedupeKey: `${key}:capacity:${i}`, payload: c }); n++; }
  log(`x      pass ${cycle}: tweet ${t.id}, ${n} event(s)${x.skipReason ? ` (skipped: ${x.skipReason})` : ""}`);
}

// Shelter counts drift by a few beds per pass, always within 0..total.
async function sheetPass(d: Port, cycle: number): Promise<void> {
  const shelters = (await d.getBoard(deskId)).shelters;
  if (!shelters.length) return log("sheet  no shelters on the desk");
  const s = shelters[cycle % shelters.length];
  // Cycles -3..+3 over seven passes, so the counts move both ways instead of draining.
  const step = ((cycle * 3) % 7) - 3;
  const bedsUsed = Math.min(s.bedsTotal, Math.max(0, s.bedsUsed + step));
  await post(d, {
    deskId, source: "sheet", actor: "synthetic-sheet", type: "capacity", observedAt: new Date().toISOString(),
    dedupeKey: `synth:sheet:${RUN}:${s._id}:${cycle}`,
    payload: { shelter: s.name, bedsUsed, bedsTotal: s.bedsTotal, ...(s.coords ? { coords: s.coords } : {}), region: s.region },
  });
  log(`sheet  pass ${cycle}: ${s.name} ${s.bedsUsed} → ${bedsUsed} of ${s.bedsTotal}`);
}

// One road flips between closed and open per pass, so the map and the board change.
async function newsPass(d: Port, cycle: number): Promise<void> {
  const roads = (await d.getBoard(deskId)).roads;
  if (!roads.length) return log("news   no roads on the desk");
  const r = roads[cycle % roads.length];
  const state = r.state === "closed" ? "open" : "closed";
  await post(d, {
    deskId, source: "news", actor: "synthetic-news", type: "closure", observedAt: new Date().toISOString(),
    dedupeKey: `synth:news:${RUN}:${r._id}:${cycle}`,
    payload: { road: r.road, state, reason: `simulated news update, pass ${cycle}`, ...(r.coords ? { coords: r.coords } : {}) },
  });
  log(`news   pass ${cycle}: ${r.road} ${r.state} → ${state}`);
}

// A point 120 to 600 m from `c`, turned by the golden angle each time so the sites spread out.
function offset(c: LatLng, n: number): LatLng {
  const a = (n * 137.5 * Math.PI) / 180;
  const m = 120 + (n % 9) * 60;
  const dLat = (m * Math.cos(a)) / 111_320;
  const dLng = (m * Math.sin(a)) / (111_320 * Math.cos((c[0] * Math.PI) / 180));
  return [Number((c[0] + dLat).toFixed(5)), Number((c[1] + dLng).toFixed(5))];
}

// The dispatcher gives a call to the nearest free volunteer, so the point has to be nearer to `me`
// than to any other volunteer, and more than the keeper's merge radius from every site.
function spot(me: LatLng, others: LatLng[], sites: LatLng[]): LatLng | undefined {
  for (let i = 0; i < 60; i++) {
    const p = offset(me, busyN + i);
    const mine = haversineMeters(me, p);
    if (others.some((o) => haversineMeters(o, p) <= mine)) continue;
    if (sites.some((s) => haversineMeters(s, p) < 150)) continue;
    busyN += i + 1;
    return p;
  }
  return undefined;
}

async function busyPass(d: Port, cycle: number): Promise<void> {
  const [users, board] = await Promise.all([d.listUsers(), d.getBoard(deskId)]);
  const now = Date.now();
  for (const u of users) {
    if (u.deskId !== deskId || u.role !== "volunteer" || u.status !== "available" || !u.coords) continue;
    if (!u.lastSeen || now - new Date(u.lastSeen).getTime() > SEEN_MS) continue;
    const open = board.tasks.filter((t) => t.open && t.assignee === u._id).length;
    if (open >= BUSY_MIN || now - (lastBusy.get(u._id) ?? 0) < BUSY_COOLDOWN_MS) continue;
    lastBusy.set(u._id, now);
    const others = users.filter((o) => o._id !== u._id && o.deskId === deskId && o.role === "volunteer" && o.coords).map((o) => o.coords!);
    const coords = spot(u.coords, others, board.sites.flatMap((s) => (s.coords ? [s.coords] : [])));
    if (!coords) { log(`busy   pass ${cycle}: no free spot near ${u._id}`); continue; }
    const n = busyN;
    const street = STREETS[n % STREETS.length];
    const no = 3 + ((n * 7) % 40);
    const people = 1 + (n % 3);
    const address = `${street} ${no}`;
    const meters = Math.round(haversineMeters(u.coords, coords));
    await post(d, {
      deskId, source: "x", actor: "synthetic-feed", type: "report", observedAt: new Date().toISOString(),
      dedupeKey: `synth:busy:${RUN}:${n}`,
      payload: {
        kind: "trapped", peopleCount: people, address, coords, region: u.region,
        text: `Tatbikat: ${address}, ${people} kişi enkaz altında, sesleri geliyor. (#${RUN}-${n})`,
        textEn: `Drill: ${address}, ${people} ${people === 1 ? "person" : "people"} trapped, voices heard. (#${RUN}-${n})`,
      },
    });
    log(`busy   pass ${cycle}: ${u._id} had ${open} open task(s), new report at ${address}, ${meters} m away`);
  }
}

async function main() {
  const tweets = readReplay(TWEETS);
  if (!tweets.length) throw new Error(`no tweets in ${TWEETS}`);
  log(`simulating x, sheet and news into ${deskId}, every ${EVERY_MS / 1000} s, no model calls, no network`);
  let stopping = false;
  process.on("SIGINT", () => { stopping = true; });
  process.on("SIGTERM", () => { stopping = true; });
  for (let cycle = 0; !stopping; cycle++) {
    const d = desk();
    for (const [name, run] of [
      ["x", () => xPass(d, cycle, tweets)],
      ["sheet", () => sheetPass(d, cycle)],
      ["news", () => newsPass(d, cycle)],
      ["busy", () => busyPass(d, cycle)],
    ] as const) {
      try { await run(); } catch (err) { log(`${name} pass ${cycle} failed: ${err instanceof Error ? err.message : err}`); }
    }
    if (once) break;
    await new Promise((r) => setTimeout(r, EVERY_MS));
  }
  log("stopped");
  process.exit(0);
}

main().catch((e) => { log(`fatal: ${e.message}`); process.exit(1); });
