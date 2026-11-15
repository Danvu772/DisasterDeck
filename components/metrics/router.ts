// Which metrics answer a question. Keyword matching on TRIGGERS, at most two ids, most specific first.
// The sitrep (ics209) covers everything, so it always goes after a narrower match.
import type { MetricId } from "./types";
import { METRIC_IDS, TRIGGERS } from "./registry";

const GENERAL: MetricId[] = ["ics209"];

// toLowerCase turns "İ" into "i" plus a combining dot. Drop the dot so "KAPASİTE" matches "kapasite".
function normalize(text: string): string {
  return ` ${text.toLowerCase().replace(/̇/g, "").replace(/[^\p{L}\p{N}-]+/gu, " ")} `;
}

export function metricsForQuestion(text: string): MetricId[] {
  const q = normalize(text);
  const scored = METRIC_IDS.map((id) => {
    const hits = TRIGGERS[id].filter((t) => q.includes(` ${t}`));
    return { id, hits: hits.length, chars: hits.reduce((s, t) => s + t.length, 0) };
  }).filter((s) => s.hits > 0);
  scored.sort((a, b) =>
    Number(GENERAL.includes(a.id)) - Number(GENERAL.includes(b.id)) || b.hits - a.hits || b.chars - a.chars);
  return scored.slice(0, 2).map((s) => s.id);
}
