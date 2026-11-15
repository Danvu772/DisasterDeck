// Quake watcher: aftershock warnings for the desk. Plain code, no LLM, no cost. Owner: Role 2.
//
//   npx tsx --env-file=.env.local workers/quake-watcher.ts --replay --from 2023-02-06T10:00:00Z --speed 60
//       Replays the real February 2023 sequence (USGS) from the given scenario time, 60× faster than
//       real time. It also starts the scenario clock, so every personal agent now lives in that time and
//       warns its person about a nearby aftershock in the first line of its next reply.
//   npx tsx --env-file=.env.local workers/quake-watcher.ts --live
//       Polls AFAD and USGS once a minute and warns about real quakes near the desk.
//
// What it does with a quake worth a warning (M5 within 100 km, M6 within 200 km, M7 within 400 km):
//   1. prints it,
//   2. posts an `alert` event of kind "quake" — ONLY when QUAKE_ALERT_EVENTS=1, because Role 1's
//      AlertPayload has no "quake" kind yet (see agents/TODO.md, "Needs from teammates"). Until then
//      the warning reaches people through their personal agents, which read the same quakes.

import { desk } from "../agents/desk";
import {
  DESK_CENTER, distanceKm, liveCatalog, quakeLine, replayCatalog, scenarioNow, startReplayClock,
  stopReplayClock, worthWarning, type Quake,
} from "../agents/research/quakes";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const replay = process.argv.includes("--replay");
const from = arg("from") ?? "2023-02-06T10:00:00Z";
const speed = Number(arg("speed") ?? 60);
const deskId = process.env.DESK_ID ?? "antakya-2023";
const postEvents = process.env.QUAKE_ALERT_EVENTS === "1";
const log = (...m: unknown[]) => console.error(`[quake-watcher ${new Date().toISOString().slice(11, 19)}]`, ...m);

const seen = new Set<string>();

async function warn(q: Quake, scenarioTime: Date) {
  if (seen.has(q.id)) return;
  seen.add(q.id);
  const km = Math.round(distanceKm(DESK_CENTER, [q.lat, q.lon]));
  if (!worthWarning(q.mag, km)) return;
  const minutesAgo = Math.max(0, Math.round((+scenarioTime - Date.parse(q.time)) / 60000));
  log(`WARNING ${quakeLine({ ...q, km, minutesAgo })}`);
  if (!postEvents) return;
  try {
    const id = await desk().postEvent({
      deskId, type: "alert", source: "system", actor: "quake-watcher", observedAt: q.time,
      dedupeKey: `quake:${q.id}`,
      payload: { zoneId: deskId, kind: "quake",
        evidence: { magnitude: q.mag, distanceKm: km, depthKm: q.depthKm, place: q.place, quakeAt: q.time, catalog: q.catalog, catalogId: q.id } },
    });
    log(`  → alert event ${id}`);
  } catch (e) {
    log(`  → alert event rejected (${(e as Error).message.slice(0, 120)}). Role 1 must add AlertPayload kind "quake".`);
  }
}

async function runReplay() {
  startReplayClock(from, speed);
  log(`replay: scenario starts ${from}, ${speed}× real time. Personal agents now use this clock.`);
  const quakes = replayCatalog().filter((q) => Date.parse(q.time) >= Date.parse(from));
  const shutdown = () => { stopReplayClock(); log("replay stopped, clock cleared"); process.exit(0); };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  for (const q of quakes) {
    const wait = (Date.parse(q.time) - +scenarioNow().now) / speed;
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    await warn(q, scenarioNow().now);
  }
  log("replay: no more quakes in the catalog. The clock keeps running until you stop this process.");
  await new Promise(() => {}); // keep the clock alive for the demo
}

async function runLive() {
  stopReplayClock();
  log("live: polling AFAD and USGS every 60 s");
  for (;;) {
    try {
      const quakes = await liveCatalog();
      for (const q of quakes) await warn(q, new Date());
    } catch (e) {
      log(`poll failed: ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 60_000));
  }
}

(replay ? runReplay() : process.argv.includes("--live") ? runLive() : Promise.reject(new Error("use --replay or --live")))
  .catch(async (e) => { log(`fatal: ${(e as Error).message}`); await desk().close?.(); process.exit(1); });
