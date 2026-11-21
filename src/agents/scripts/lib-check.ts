// Check the agents against the real desk (Role 1's MongoDB): two chat turns with seeded people.
// Needs MONGODB_URI in .env.local, `npm run db:up` and `npm run db:seed`. About $0.04.
//
//   npx tsx --env-file=.env.local agents/scripts/lib-check.ts

import { cols } from "../../lib/db";
import { desk } from "../desk";
import { runTurn } from "../personal/turn";
import { spentUsd } from "../shared/cost";

async function main() {
  if (desk().name !== "mongodb") throw new Error("Set MONGODB_URI in .env.local first (see lib/README.md).");
  const before = spentUsd();
  const turns: [string, string][] = [
    ["field-alpha", "Turuncu Avlu'dayız. Ayşe'ye ulaştık, bacağı sıkışmış. 10 battaniye ve bir doktor lazım."],
    ["public-demo", "Which shelters have space tonight?"],
  ];
  for (const [userId, text] of turns) {
    const r = await runTurn({ userId, text });
    console.log(`\n${userId}: ${r.reply}`);
    for (const a of r.actions) console.log(`  ${a.ok ? "✓" : "✗"} ${a.tool}: ${a.summary}`);
  }
  const { events, messages } = await cols();
  const filed = await events.find({ source: "person", actor: { $in: turns.map((t) => t[0]) } })
    .sort({ ts: -1 }).limit(10).toArray();
  console.log("\nIn MongoDB:");
  for (const e of filed) console.log(`  ${e.type.padEnd(7)} actor ${e.actor} · lane ${e.lane} · ${e.status} · ${JSON.stringify(e.payload).slice(0, 90)}`);
  console.log(`  messages stored: ${await messages.countDocuments()}`);
  console.log(`\ncost $${(spentUsd() - before).toFixed(4)}`);
  await desk().close?.();
}

main().catch(async (e) => { console.error(e); await desk().close?.(); process.exit(1); });
