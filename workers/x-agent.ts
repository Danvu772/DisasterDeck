// X agent worker: replays tweets as if they arrived live. Each call for help becomes a
// `report` event, each supply request a `need` event, each closed or reopened road a `closure`
// event, and a shelter's fullness, when the tweet gives numbers, a `capacity` event.
// Other tweets are skipped. Owner: Role 2.
//
//   npx tsx --env-file=.env.local workers/x-agent.ts --mock      no key, no cost
//   npx tsx --env-file=.env.local workers/x-agent.ts --limit 3   real Claude (about $0.006 per tweet)
//
// Flags: --file <path>  --speed <x>  --limit <n>  --mock
// Env:   ANTHROPIC_API_KEY, ANTHROPIC_MODEL_EXTRACT, DESK_API_URL (unset = fake desk, events printed),
//        AGENT_KEY, DESK_ID, REPLAY_SPEED, AGENT_BUDGET_USD

import { existsSync, readFileSync } from "node:fs";
import { desk } from "../agents/desk";
import { extractTweet, type ReplayTweet } from "../agents/research/x-extract";
import { BudgetError, spentUsd } from "../agents/shared/cost";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const mock = process.argv.includes("--mock");
const speed = Number(arg("speed") ?? process.env.REPLAY_SPEED ?? 10);
const limit = Number(arg("limit") ?? Infinity);
const deskId = process.env.DESK_ID ?? "antakya-2023";
const file = arg("file")
  ?? (existsSync("data/tweets_replay.json") ? "data/tweets_replay.json" : "agents/fixtures/tweets_sample.json");

const log = (...m: unknown[]) => console.error(`[x-agent ${new Date().toISOString().slice(11, 19)}]`, ...m);

async function main() {
  const tweets = (JSON.parse(readFileSync(file, "utf8")) as ReplayTweet[])
    .sort((a, b) => a.ts_offset_seconds - b.ts_offset_seconds)
    .slice(0, limit);
  const d = desk();
  const spentAtStart = spentUsd();
  log(`${tweets.length} tweets from ${file}, speed ${speed}×, ${mock ? "MOCK" : "Claude"}, desk: ${d.name}`);

  const start = Date.now();
  let reports = 0, unclear = 0, hazards = 0, needs = 0, closures = 0, capacities = 0, skipped = 0, failed = 0;

  for (const t of tweets) {
    const due = start + (t.ts_offset_seconds * 1000) / speed;
    if (due > Date.now()) await new Promise((r) => setTimeout(r, due - Date.now()));
    try {
      const x = await extractTweet(t, { mock });
      const base = { deskId, source: "x" as const, actor: "x-agent", observedAt: new Date().toISOString() };
      if (x.report) {
        const id = await d.postEvent({ ...base, type: "report", dedupeKey: `x:${t.id}`, payload: x.report });
        reports++;
        log(`report ${t.id} → ${id} (${x.report.kind}, ${x.report.address ?? "no address"}${x.unclear ? `, UNCLEAR: ${x.unclear}` : ""}${x.hazard ? `, HAZARD: ${x.hazard}` : ""}, ${x.report.textEn.slice(0, 60)})`);
        if (x.unclear) unclear++;
        if (x.hazard) hazards++;
      }
      for (const [i, n] of x.needs.entries()) {
        const id = await d.postEvent({ ...base, type: "need", dedupeKey: `x:${t.id}:need:${i}`, payload: n });
        needs++;
        log(`need   ${t.id} → ${id} (${n.quantity} ${n.item}${n.lifeThreatening ? ", life-threatening" : ""})`);
      }
      for (const [i, c] of x.closures.entries()) {
        const id = await d.postEvent({ ...base, type: "closure", dedupeKey: `x:${t.id}:closure:${i}`, payload: c });
        closures++;
        log(`road   ${t.id} → ${id} (${c.road}: ${c.state}, ${c.reason})`);
      }
      for (const [i, c] of x.capacities.entries()) {
        const id = await d.postEvent({ ...base, type: "capacity", dedupeKey: `x:${t.id}:capacity:${i}`, payload: c });
        capacities++;
        log(`beds   ${t.id} → ${id} (${c.shelter}: ${c.bedsUsed}/${c.bedsTotal})`);
      }
      for (const name of x.capacityNoNumbers) log(`beds   ${t.id}: "${name}" said to be full, no numbers, not posted`);
      if (x.skipReason) {
        skipped++;
        log(`skip   ${t.id}: ${x.skipReason}`);
      }
    } catch (err) {
      if (err instanceof BudgetError) { log(err.message); break; }
      failed++;
      log(`FAIL   ${t.id}: ${(err as Error).message}`);
    }
  }
  log(`done: ${reports} reports (${unclear} need a call, ${hazards} with a hazard), ${needs} needs, ${closures} roads, ` +
    `${capacities} shelter counts, ${skipped} skipped, ${failed} failed · cost $${(spentUsd() - spentAtStart).toFixed(4)}`);
  await d.close?.();
}

main().catch((e) => { log(`fatal: ${e.message}`); process.exit(1); });
