// Pure adapters for /compare. Turn the replay tweets into table rows (what volunteers had today)
// and into sites (what the desk makes of the same tweets).
import type { Site } from "@/lib/types";

export type Tweet = { id: string; text: string; ts_offset_seconds: number; region: string };
export type Row = { id: string; time: string; textEn: string; text: string; address: string };

// The replay file has Turkish text only. English and address are written by hand, per tweet id.
const NOTES: Record<string, { address: string; en: string }> = {
  "demo-malatya-001": { address: "Turuncu Avlu", en: "Drill: Malatya centre, Ayşe is under the rubble at Turuncu Avlu. We are asking for help for one person." },
  "demo-malatya-002": { address: "Turuncu Avlu", en: "Passing on the first report: Ayşe is trapped at Turuncu Avlu in central Malatya." },
  "demo-malatya-003": { address: "Turuncu Avlu", en: "Sharing the same call again. Malatya centre, Turuncu Avlu. A team is awaited for Ayşe, one person under the rubble." },
  "demo-malatya-004": { address: "Turuncu Avlu", en: "Drill update: repeating the first call for help for Ayşe at Turuncu Avlu. Central Malatya, one person." },
  "demo-malatya-005": { address: "Mor Avlu", en: "Separate drill report: Malatya centre, two people under the rubble at Mor Avlu. A team is needed." },
};

// Phone numbers stay masked, same rule as the rest of the app.
const mask = (s: string) => s.replace(/\d{3} \d{3} \d{2} (\d{2})/g, "•••• •• $1");

export function toRows(tweets: Tweet[]): Row[] {
  return tweets.map((t) => ({
    id: t.id,
    time: `+${t.ts_offset_seconds} s`,
    textEn: NOTES[t.id]?.en ?? "",
    text: mask(t.text),
    address: NOTES[t.id]?.address ?? "Unknown",
  }));
}

// One site per address. `bases` are fixture sites from makeBoard, reused for their shape and ages.
// The first base gets a volunteer on it, the rest stay unclaimed.
export function toSites(tweets: Tweet[], bases: Site[], now: number): { site: Site; owner: string }[] {
  const byAddress = new Map<string, Tweet[]>();
  for (const t of tweets) {
    const a = NOTES[t.id]?.address ?? "Unknown";
    byAddress.set(a, [...(byAddress.get(a) ?? []), t]);
  }
  return [...byAddress.entries()].map(([address, posts], i) => {
    const base = bases[i];
    const claimed = i === 0;
    const site: Site = {
      ...base,
      address,
      region: "Malatya centre",
      peopleTrapped: i === 0 ? 1 : 2,
      callStatus: claimed ? "called" : "not_called",
      status: "open",
      sources: posts.map((p) => ({ source: "x" as const, eventId: p.id })),
      support: 1,
      // Only a person in the history confirms a site. X alone leaves it unconfirmed.
      confidence: claimed ? base.confidence : "unconfirmed",
      history: claimed
        ? [{ ts: new Date(now - 3 * 60000), by: "Zeynep", source: "person", reason: "Taking the call" }]
        : [],
    };
    return { site, owner: claimed ? "Zeynep is calling" : "Nobody yet" };
  });
}
