// X agent worker: replays tweets as if they arrived live. Each call for help becomes a
// `report` event, each supply request a `need` event, each closed or reopened road a `closure`
// event, and a shelter's fullness, when the tweet gives numbers, a `capacity` event.
// Other tweets are skipped. Owner: Role 2.
//
//   npx tsx --env-file=.env.local workers/x-agent.ts --mock      no key, no cost
//   npx tsx --env-file=.env.local workers/x-agent.ts --limit 3   real model (gpt-oss-120b on OpenRouter)
//
// Flags: --file <path>  --speed <x>  --limit <n>  --mock  --dry-run  --require-live
// Env:   OPENROUTER_API_KEY, OPENROUTER_MODEL_EXTRACT, DESK_API_URL (unset = fake desk, events printed),
//        AGENT_KEY, DESK_ID, REPLAY_SPEED, AGENT_BUDGET_USD

import { configuredDeskId } from "../lib/pilot";
import { existsSync } from "node:fs";
import { desk, type NewEvent } from "../agents/desk";
import { extractTweet } from "../agents/research/x-extract";
import { isHistoricalTweet, readReplay, replayKey, replayObservation } from "../agents/research/replay-input";
import { eventBody } from "../lib/schemas";
import { BudgetError, spentUsd } from "../agents/shared/cost";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const mock = process.argv.includes("--mock");
const dryRun = process.argv.includes("--dry-run");
const requireLive = process.argv.includes("--require-live");
const speed = Number(arg("speed") ?? process.env.REPLAY_SPEED ?? 10);
const limit = Number(arg("limit") ?? Infinity);
const deskId = configuredDeskId();
const file = arg("file")
  ?? (existsSync("data/replays/antakya-real-tweets.json") ? "data/replays/antakya-real-tweets.json"
    : existsSync("data/tweets_replay.json") ? "data/tweets_replay.json" : "agents/fixtures/tweets_sample.json");

const log = (...m: unknown[]) => console.error(`[x-agent ${new Date().toISOString().slice(11, 19)}]`, ...m);

async function main() {
  if (!Number.isFinite(speed) || speed <= 0) throw new Error("--speed must be a finite positive number");
  if (limit !== Infinity && (!Number.isInteger(limit) || limit <= 0)) throw new Error("--limit must be a positive integer");
  const tweets = readReplay(file).slice(0, limit);
  const d = desk();
  let previewCount = 0;
  const post = async (event: NewEvent) => {
    eventBody.parse(event);
    if (!dryRun) return d.postEvent(event);
    console.log(JSON.stringify(event));
    return `dry-run-${++previewCount}`;
  };
  try {
    if ((requireLive || tweets.some(isHistoricalTweet)) && !dryRun) {
      if (d.name === "fixture") throw new Error("No real desk configured. Set MONGODB_URI or DESK_BACKEND=http with DESK_API_URL and AGENT_KEY in .env.local. Use --dry-run --mock to preview without writes or model calls.");
      await d.getBoard(deskId); // Check connectivity/authorization before paying for extraction.
    }
    const spentAtStart = spentUsd();
    log(`${tweets.length} tweets from ${file}, speed ${speed}×, ${mock ? "MOCK" : "model"}, desk: ${dryRun ? "dry-run (no writes)" : d.name}; ${tweets.filter(isHistoricalTweet).length} historical real posts`);

    const start = Date.now();
    let reports = 0, unclear = 0, hazards = 0, needs = 0, closures = 0, capacities = 0, skipped = 0, failed = 0;

    for (const t of tweets) {
      const due = start + (t.ts_offset_seconds * 1000) / speed;
      if (due > Date.now()) await new Promise((r) => setTimeout(r, due - Date.now()));
      try {
        const x = await extractTweet(t, { mock });
        const base = { deskId, source: "x" as const, actor: "x-agent", observedAt: replayObservation(t) };
        const key = replayKey(t, deskId);
        if (x.report) {
          const id = await post({ ...base, type: "report", dedupeKey: key, payload: x.report });
          reports++;
          log(isHistoricalTweet(t) ? `historical report ${t.id} → ${id} (${x.report.kind}, observed ${base.observedAt}; location requires review)` : `report ${t.id} → ${id} (${x.report.kind}, ${x.report.address ?? "no address"}${x.unclear ? `, UNCLEAR: ${x.unclear}` : ""}${x.hazard ? `, HAZARD: ${x.hazard}` : ""}, ${x.report.textEn.slice(0, 60)})`);
          if (x.unclear) unclear++;
          if (x.hazard) hazards++;
        }
        for (const [i, n] of x.needs.entries()) {
          const id = await post({ ...base, type: "need", dedupeKey: `${key}:need:${i}`, payload: n });
          needs++;
          log(`need   ${t.id} → ${id} (${n.quantity} ${n.item}${n.lifeThreatening ? ", life-threatening" : ""})`);
        }
        for (const [i, c] of x.closures.entries()) {
          const id = await post({ ...base, type: "closure", dedupeKey: `${key}:closure:${i}`, payload: c });
          closures++;
          log(`road   ${t.id} → ${id} (${c.road}: ${c.state}, ${c.reason})`);
        }
        for (const [i, c] of x.capacities.entries()) {
          const id = await post({ ...base, type: "capacity", dedupeKey: `${key}:capacity:${i}`, payload: c });
          capacities++;
          log(`beds   ${t.id} → ${id} (${c.shelter}: ${c.bedsUsed}/${c.bedsTotal})`);
        }
        for (const name of x.capacityNoNumbers) log(`beds   ${t.id}: "${name}" said to be full, no numbers, not posted`);
        if (x.skipReason) {
          skipped++;
          log(isHistoricalTweet(t) ? `skip historical post ${t.id}: no actionable payload` : `skip   ${t.id}: ${x.skipReason}`);
        }
      } catch (err) {
        if (err instanceof BudgetError) { log(err.message); break; }
        failed++;
        log(`FAIL   ${t.id}: ${(err as Error).message}`);
      }
    }
    log(`done: ${reports} reports (${unclear} need a call, ${hazards} with a hazard), ${needs} needs, ${closures} roads, ` +
      `${capacities} shelter counts, ${skipped} skipped, ${failed} failed · cost $${(spentUsd() - spentAtStart).toFixed(4)}`);
    if (failed) process.exitCode = 1;
  } finally {
    await d.close?.();
  }
}

main().catch((e) => { log(`fatal: ${e.message}`); process.exit(1); });
