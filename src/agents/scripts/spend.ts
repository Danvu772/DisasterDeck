// How much of the API budget the agents have used on this machine, by label and model.
//   npx tsx agents/scripts/spend.ts

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { BUDGET_USD } from "../shared/cost";

const file = path.join(process.cwd(), "src", "agents", ".usage", "usage.jsonl");
if (!existsSync(file)) { console.log("No spend recorded yet."); process.exit(0); }

const rows = readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const by = new Map<string, { calls: number; usd: number }>();
let total = 0;
for (const r of rows) {
  const key = `${String(r.label).split(":")[0].padEnd(14)} ${r.model}`;
  const x = by.get(key) ?? { calls: 0, usd: 0 };
  x.calls++; x.usd += r.usd; total += r.usd;
  by.set(key, x);
}
for (const [k, v] of [...by].sort((a, b) => b[1].usd - a[1].usd)) {
  console.log(`${k.padEnd(40)} ${String(v.calls).padStart(5)} calls  $${v.usd.toFixed(4)}`);
}
console.log(`\nTotal $${total.toFixed(4)} of the $${BUDGET_USD} agent budget (this machine only).`);
