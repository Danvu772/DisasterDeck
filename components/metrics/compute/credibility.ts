// credibility, the Admiralty code (NATO 6 x 6). Two axes, never merged into one score.
// Reliability A to F, from the best source behind a fact: official person A, vetted person B,
// NASA and the sheet B, news C, social posts and public people D, unknown F.
// Credibility 1 to 6, from the fact itself: confirmed 1, corroborated 2, two or more reporters 3,
// one report 4, retracted 5, no data 6.
// A fact's sources: site.sources, non-system history entries, and events whose result names the record.
import type { Confidence, Event, HistoryEntry, Source, Trust, User } from "@/lib/types";
import type { MetricResult } from "../types";
import type { MetricInput } from "../registry";
import { plural, unknown } from "./shared";

const SOURCE = { name: "Admiralty code, NATO source reliability and information credibility", url: "https://en.wikipedia.org/wiki/Admiralty_code" };
const TITLE = "Source reliability against information credibility";

export const RELIABILITY = ["A", "B", "C", "D", "E", "F"] as const;
export const CREDIBILITY = ["1", "2", "3", "4", "5", "6"] as const;
const ROW_WORD = ["A reliable", "B usually reliable", "C fairly reliable", "D not usually reliable", "E unreliable", "F cannot be judged"];
const COL_WORD = ["1 confirmed", "2 probably true", "3 possibly true", "4 doubtful", "5 improbable", "6 cannot be judged"];

const TRUST_ROW: Record<Trust, number> = { official: 0, vetted: 1, public: 3 };
const SOURCE_ROW: Partial<Record<Source, number>> = {
  nasa: 1, sheet: 1, news: 2, x: 3, reddit: 3, instagram: 3, facebook: 3,
};

interface Ref { source: Source; actor?: string }

function rowOf(ref: Ref, users: Map<string, User>): number {
  if (ref.source === "person") {
    const u = ref.actor ? users.get(ref.actor) : undefined;
    return u ? TRUST_ROW[u.trust] : 5;
  }
  return SOURCE_ROW[ref.source] ?? 5;
}

function colOf(confidence: Confidence | undefined, reporters: number, retracted: boolean): number {
  if (retracted) return 4;
  if (confidence === "confirmed") return 0;
  if (confidence === "corroborated") return 1;
  if (reporters >= 2) return 2;
  if (reporters === 1) return 3;
  return 5;
}

export function compute({ board, events, users, now }: MetricInput): MetricResult {
  const byUser = new Map<string, User>();
  for (const u of users ?? []) { byUser.set(u._id, u); byUser.set(u.name, u); }
  const byEvent = new Map<string, Event>();
  const byRecord = new Map<string, Event[]>();
  for (const e of events ?? []) {
    if (e._id) byEvent.set(e._id, e);
    for (const id of e.result?.recordIds ?? []) byRecord.set(id, [...(byRecord.get(id) ?? []), e]);
  }

  const fromHistory = (h: HistoryEntry[] | undefined): Ref[] =>
    (h ?? []).filter((e) => e.source !== "system").map((e) => ({ source: e.source, actor: e.by }));
  const fromEvents = (id: string): Ref[] =>
    (byRecord.get(id) ?? []).filter((e) => e.source !== "system").map((e) => ({ source: e.source, actor: e.actor }));

  const cells = RELIABILITY.map(() => CREDIBILITY.map(() => 0));
  let facts = 0;
  let thinDanger = 0;
  const place = (refs: Ref[], confidence: Confidence | undefined, reporters: number, retracted: boolean, tier0: boolean) => {
    const row = refs.length ? Math.min(...refs.map((r) => rowOf(r, byUser))) : 5;
    const col = colOf(confidence, reporters, retracted);
    cells[row][col]++;
    facts++;
    if (tier0 && !retracted && col >= 3) thinDanger++;
  };

  for (const s of board.sites) {
    const refs: Ref[] = [
      ...s.sources.map((x) => ({ source: x.source, actor: byEvent.get(x.eventId)?.actor })),
      ...fromHistory(s.history), ...fromEvents(s._id),
    ];
    place(refs, s.confidence, Math.max(s.support ?? 0, s.sources.length), s.status === "retracted", s.tier === 0);
  }
  for (const n of board.needs) {
    if (n.status === "cancelled") continue;
    const refs = [...fromHistory(n.history), ...fromEvents(n._id)];
    place(refs, n.confidence, Math.max(n.support ?? 0, n.requestedBy?.length ?? 0), false, n.tier === 0);
  }
  for (const r of board.roads) {
    const refs = [...fromHistory(r.history), ...fromEvents(r._id)];
    place(refs, r.confidence, new Set(refs.map((x) => `${x.source}:${x.actor ?? ""}`)).size, false, false);
  }
  for (const s of board.shelters) {
    const refs = [...fromHistory(s.history), ...fromEvents(s._id)];
    place(refs, undefined, new Set(refs.map((x) => `${x.source}:${x.actor ?? ""}`)).size, false, false);
  }

  if (!facts) {
    return unknown("credibility", TITLE, SOURCE,
      "No sites, needs, roads or shelters to grade yet.",
      "an empty board", now);
  }

  const reliable = cells[0].reduce((a, b) => a + b, 0) + cells[1].reduce((a, b) => a + b, 0);
  const credible = cells.reduce((s, row) => s + row[0] + row[1], 0);
  const unjudged = cells[5].reduce((a, b) => a + b, 0);
  return {
    id: "credibility", title: TITLE, source: SOURCE, computedAt: now,
    status: thinDanger ? "warn" : "ok",
    headline: `${reliable} of ${plural(facts, "fact")} come from a reliable source (A or B), and ${credible} are confirmed or corroborated (1 or 2).${thinDanger ? ` ${plural(thinDanger, "life-threatening record")} rest on a single unconfirmed report.` : ""}`,
    chart: { kind: "matrix", rows: ROW_WORD, cols: COL_WORD, cells, rowTitle: "Source reliability", colTitle: "Information credibility" },
    basis: [
      `from ${plural(facts, "site, need, road and shelter", "sites, needs, roads and shelters")}`,
      users ? `people graded by their trust level` : "no user list, so people count as F",
      unjudged ? `${unjudged} with no source on record` : "",
    ].filter(Boolean).join(", "),
  };
}
