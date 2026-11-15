// Read only: the latest events of one source on the desk, in full, as they are stored.
//   npx tsx --env-file=.env.local agents/scripts/show-events.ts x 8
// First argument: source (x, news, sheet, person, …). Second: how many (default 5).

import { closeDb, cols } from "../../lib/db";
import type { Source } from "../../lib/types";

async function main() {
  const source = (process.argv[2] ?? "x") as Source;
  const limit = Number(process.argv[3] ?? 5);
  const { events } = await cols();
  console.log(`${await events.countDocuments({ source })} events with source "${source}". Latest ${limit}:`);
  for (const e of await events.find({ source }).sort({ ts: -1 }).limit(limit).toArray()) {
    console.log(JSON.stringify({ actor: e.actor, status: e.status, ts: e.ts, observedAt: e.observedAt,
      dedupeKey: e.dedupeKey, payload: e.payload, result: e.result }, null, 1));
  }
  await closeDb();
}

main().catch(async (e) => { console.error(e); await closeDb(); process.exit(1); });
