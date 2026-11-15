// Simulated feeds: streams the constant-change inputs into the desk on a loop, for now.
// Every channel is simulated. No model call, no network, no key, no cost. The real agents
// (X, news, sheet, quake) come back when the agentic layers are integrated.
//
//   x       the replay tweets, mock extraction: reports, needs, road closures, shelter counts
//   sheet   random small changes to shelter bed counts, as the shelter sheet would send them
//   news    road closures toggled open and closed, as news would report them
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
import { eventBody } from "../lib/schemas";

const TWEETS = "data/tweets_replay.json";
const EVERY_MS = Number(process.env.SYNTH_EVERY_S ?? 30) * 1000;
const deskId = process.env.DESK_ID ?? "malatya-2023";
const once = process.argv.includes("--once");
const log = (...m: unknown[]) => console.log(`[synthetic-feed ${new Date().toISOString().slice(11, 19)}]`, ...m);

type Port = ReturnType<typeof desk>;

async function post(d: Port, event: NewEvent): Promise<string> {
  eventBody.parse(event);
  return d.postEvent(event);
}

async function xPass(d: Port, cycle: number, tweets: ReturnType<typeof readReplay>): Promise<void> {
  const t = tweets[cycle % tweets.length];
  const x = await extractTweet(t, { mock: true });
  const base = { deskId, source: "x" as const, actor: "synthetic-feed", observedAt: new Date().toISOString() };
  const key = `${replayKey(t, deskId)}:synth:${cycle}`;
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
  const step = ((cycle * 7) % 7) - 3;
  const bedsUsed = Math.min(s.bedsTotal, Math.max(0, s.bedsUsed + step));
  await post(d, {
    deskId, source: "sheet", actor: "synthetic-sheet", type: "capacity", observedAt: new Date().toISOString(),
    dedupeKey: `synth:sheet:${s._id}:${cycle}`,
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
    dedupeKey: `synth:news:${r._id}:${cycle}`,
    payload: { road: r.road, state, reason: `simulated news update, pass ${cycle}`, ...(r.coords ? { coords: r.coords } : {}) },
  });
  log(`news   pass ${cycle}: ${r.road} ${r.state} → ${state}`);
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
