// Quick check of the earthquake feed, no model call, no cost.
//   npx tsx agents/scripts/quake-check.ts
// Prints the live catalog size (AFAD + USGS, last 24 h) and what a person in Malatya would be warned
// about now; then what they would be warned about at 10:30 UTC on 6 Feb 2023 in the replay catalog.

import { DESK_CENTER, distanceKm, liveCatalog, quakeLine, replayCatalog, worthWarning } from "../research/quakes";

async function main() {
  const live = await liveCatalog();
  const byCat = live.reduce<Record<string, number>>((m, q) => ({ ...m, [q.catalog]: (m[q.catalog] ?? 0) + 1 }), {});
  console.log(`live, last 24 h: ${live.length} quakes M4+ in the region`, byCat);
  for (const q of live.slice(-3)) console.log(`  ${q.time} M${q.mag} ${q.place} (${q.catalog})`);

  const at = Date.parse("2023-02-06T10:30:00Z");
  const warn = replayCatalog()
    .map((q) => ({ ...q, km: Math.round(distanceKm(DESK_CENTER, [q.lat, q.lon])), minutesAgo: Math.round((at - Date.parse(q.time)) / 60000) }))
    .filter((q) => q.minutesAgo >= 0 && q.minutesAgo <= 60 && worthWarning(q.mag, q.km));
  console.log(`\nreplay at 2023-02-06 10:30 UTC, warnings for Malatya (last 60 min):`);
  for (const q of warn) console.log(`  ${quakeLine(q)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
