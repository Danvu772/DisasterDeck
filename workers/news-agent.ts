// News agent worker: official feeds (NWS, FEMA, USGS) through the search port, each entry posted
// as a schema-checked event with a dedupeKey. Replaced the Claude web-search agent (D-0009).
//
//   npx tsx --env-file=.env.local workers/news-agent.ts --replay              fixtures, offline
//   npx tsx --env-file=.env.local workers/news-agent.ts --live                 fetch the real feeds
//   npx tsx --env-file=.env.local workers/news-agent.ts --replay --kind nws    one feed only
//
// Flags: --kind all|nws|fema|usgs  --replay|--live  --dry-run  --limit <n>  --region <name>
// Env:   DESK_ID, DESK_API_URL + AGENT_KEY (http desk), or MONGODB_URI (lib desk), else fixtures.

import { configuredDeskId } from "../lib/pilot";
import { desk } from "../agents/desk";
import { FEED_KINDS, type FeedKind } from "../agents/research/news-search";
import { officialFeedsProvider } from "../agents/research/search-port";
import { eventBody } from "../lib/schemas";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const replay = process.argv.includes("--replay");
const live = process.argv.includes("--live");
const dryRun = process.argv.includes("--dry-run");
const kindArg = arg("kind") ?? "all";
const channels: FeedKind[] = kindArg === "all" ? [...FEED_KINDS] : [kindArg as FeedKind];
const region = arg("region");
const limit = Number(arg("limit") ?? Infinity);
const deskId = configuredDeskId();
const log = (...m: unknown[]) => console.error(`[news-agent ${new Date().toISOString().slice(11, 19)}]`, ...m);

async function main() {
  if (!replay && !live) throw new Error("use --replay (fixtures) or --live (real feeds)");
  if (channels.some((c) => !FEED_KINDS.includes(c))) throw new Error(`unknown channel "${kindArg}": use all, ${FEED_KINDS.join(", ")}`);
  if (!Number.isFinite(limit) || limit <= 0) throw new Error("--limit must be a positive integer");

  const d = desk();
  const provider = officialFeedsProvider();
  const events = await provider.search({ q: region, region, channels, deskId, replay });
  const post = async (e: typeof events[number]) => {
    const event = { deskId, ...e };
    eventBody.parse(event);   // schema-checked at the door, like POST /api/events
    if (!dryRun) return d.postEvent(event);
    console.log(JSON.stringify(event));
    return `dry-run-${e.dedupeKey}`;
  };

  let posted = 0, failed = 0;
  for (const [i, e] of events.slice(0, limit).entries()) {
    try {
      const id = await post(e);
      posted++;
      log(`${e.actor} #${i + 1} ${e.type.padEnd(7)} → ${id} · ${e.dedupeKey} · ${JSON.stringify(e.payload).slice(0, 100)}`);
    } catch (err) {
      failed++;
      log(`FAIL ${e.dedupeKey}: ${(err as Error).message}`);
    }
  }
  log(`done: ${posted} posted, ${failed} failed from ${channels.join(", ")} (${dryRun ? "dry-run, no writes" : d.name})`);
  await d.close?.();
}

main().catch(async (e) => { log(`fatal: ${(e as Error).message}`); await desk().close?.(); process.exit(1); });
