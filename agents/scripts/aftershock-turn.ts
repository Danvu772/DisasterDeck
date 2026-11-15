// One chat turn while a quake replay is running: shows the aftershock warning in the agent's reply.
// Start the replay first, in another terminal:
//   npx tsx --env-file=.env.local workers/quake-watcher.ts --replay --from 2023-02-06T10:20:00Z --speed 60
// then, after ~8 s (scenario time past 10:27):
//   npx tsx --env-file=.env.local agents/scripts/aftershock-turn.ts [userId] [message]
// About $0.02.

import { desk } from "../desk";
import { runTurn } from "../personal/turn";
import { scenarioNow } from "../research/quakes";
import { spentUsd } from "../shared/cost";

async function main() {
  const userId = process.argv[2] ?? "field-alpha";
  const text = process.argv[3] ?? "Turuncu Avlu'dayız, enkazın içinde ikinci kişiye ulaşmaya çalışıyoruz.";
  const { now, replay } = scenarioNow();
  console.log(`scenario time: ${now.toISOString()} (${replay ? "replay" : "live, no replay running"}) · desk: ${desk().name}`);
  const before = spentUsd();
  const r = await runTurn({ userId, text });
  console.log(`\n${userId} says: ${text}\nagent: ${r.reply}`);
  for (const a of r.actions) console.log(`  ${a.ok ? "✓" : "✗"} ${a.tool}: ${a.summary}`);
  console.log(`\ncost $${(spentUsd() - before).toFixed(4)}`);
  await desk().close?.();
}

main().catch(async (e) => { console.error(e); await desk().close?.(); process.exit(1); });
