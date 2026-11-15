// News agent worker: live web searches for a region, findings posted as events
// (closure, need, report, capacity).
// Owner: Role 2. Run it by hand, or every 15–30 min during the demo.
//
//   npx tsx --env-file=.env.local workers/news-agent.ts                      both channels
//   npx tsx --env-file=.env.local workers/news-agent.ts --channel official   AFAD, Karayolları, AA, TRT
//   npx tsx --env-file=.env.local workers/news-agent.ts --region "Battalgazi, Antakya"
//
// Channels and their event source / actor:
//   news      source "news"    actor "news-agent"
//   official  source "news"    actor "official-agent"   (lib/types has no "official" source yet)
// Reddit is not a channel: it blocks Claude's web search, and its API is closed to new apps.
// About $0.05–0.15 per channel run (3 searches at most).

import { createHash } from "node:crypto";
import { desk } from "../agents/desk";
import { CHANNELS, searchNews, type Channel } from "../agents/research/news-search";
import { BudgetError, spentUsd } from "../agents/shared/cost";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const region = arg("region", "Antakya, Türkiye");
const when = arg("when", "6–12 February 2023, after the Kahramanmaraş earthquakes");
const pick = arg("channel", "all");
const channels: Channel[] = pick === "all" ? (Object.keys(CHANNELS) as Channel[]) : [pick as Channel];
const deskId = process.env.DESK_ID ?? "antakya-2023";
const log = (...m: unknown[]) => console.error(`[news-agent ${new Date().toISOString().slice(11, 19)}]`, ...m);

const WHO: Record<Channel, { source: "news"; actor: string }> = {
  news: { source: "news", actor: "news-agent" },
  official: { source: "news", actor: "official-agent" },
};

async function main() {
  if (channels.some((c) => !CHANNELS[c])) throw new Error(`unknown channel "${pick}": use news, official or all`);
  const d = desk();
  const before = spentUsd();
  let total = 0;
  for (const channel of channels) {
    log(`[${channel}] searching: ${region} · ${when} · desk: ${d.name}`);
    try {
      const findings = await searchNews({ region, when, channel });
      for (const f of findings) {
        const key = createHash("sha1").update(`${f.url}|${JSON.stringify(f.payload)}`).digest("hex").slice(0, 16);
        const id = await d.postEvent({
          deskId, type: f.kind, source: WHO[channel].source, actor: WHO[channel].actor, payload: f.payload,
          observedAt: f.publishedAt, dedupeKey: `${channel}:${key}`,
        });
        log(`[${channel}] ${f.kind.padEnd(7)} → ${id} · ${JSON.stringify(f.payload).slice(0, 100)} · ${f.url}`);
      }
      log(`[${channel}] ${findings.length} findings`);
      total += findings.length;
    } catch (e) {
      if (e instanceof BudgetError) throw e;
      log(`[${channel}] failed: ${(e as Error).message}`); // one channel failing must not stop the others
    }
  }
  log(`done: ${total} findings · cost $${(spentUsd() - before).toFixed(4)}`);
  await d.close?.();
}

main().catch(async (e) => {
  log(e instanceof BudgetError ? e.message : `fatal: ${(e as Error).message}`);
  await desk().close?.();
  process.exit(1);
});
