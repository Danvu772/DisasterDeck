// News agent worker: one live web search per run for a region, findings posted as events
// with source "news". Owner: Role 2. Run it by hand, or every 15–30 min during the demo.
//
//   npx tsx --env-file=.env.local workers/news-agent.ts
//   npx tsx --env-file=.env.local workers/news-agent.ts --region "Battalgazi, Malatya" --when "6–10 February 2023"
//
// About $0.05–0.15 per run (3 searches at most).

import { createHash } from "node:crypto";
import { desk } from "../agents/desk";
import { searchNews } from "../agents/research/news-search";
import { BudgetError, spentUsd } from "../agents/shared/cost";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const region = arg("region", "Malatya, Türkiye");
const when = arg("when", "6–12 February 2023, after the Kahramanmaraş earthquakes");
const deskId = process.env.DESK_ID ?? "malatya-2023";
const log = (...m: unknown[]) => console.error(`[news-agent ${new Date().toISOString().slice(11, 19)}]`, ...m);

async function main() {
  const d = desk();
  const before = spentUsd();
  log(`searching: ${region} · ${when} · desk: ${d.name}`);
  const findings = await searchNews({ region, when });
  for (const f of findings) {
    const key = createHash("sha1").update(`${f.url}|${JSON.stringify(f.payload)}`).digest("hex").slice(0, 16);
    const id = await d.postEvent({
      deskId, type: f.kind, source: "news", actor: "news-agent", payload: f.payload,
      observedAt: f.publishedAt, dedupeKey: `news:${key}`,
    });
    log(`${f.kind.padEnd(7)} → ${id} · ${JSON.stringify(f.payload).slice(0, 110)} · ${f.url}`);
  }
  log(`done: ${findings.length} findings · cost $${(spentUsd() - before).toFixed(4)}`);
  await d.close?.();
}

main().catch((e) => {
  log(e instanceof BudgetError ? e.message : `fatal: ${(e as Error).message}`);
  process.exit(1);
});
