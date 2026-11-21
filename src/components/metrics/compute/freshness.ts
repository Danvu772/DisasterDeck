// freshness, after WIISARD: a fact loses value as it ages. quality = 0.5 ^ (age / halfLife),
// halfLife = STALE_AFTER_MIN for the record type, so quality is exactly 0.5 when a fact turns stale.
// Age comes from observedAt (when it was true). Needs and incidents have no observedAt in the
// contract, so they use their newest history or action entry, and the basis says so.
import type { RecordType } from "@/lib/types";
import { STALE_AFTER_MIN } from "../../encode";
import type { MetricPoint, MetricResult, Tone } from "../types";
import type { MetricInput } from "../registry";
import { agoText, historyTimes, minutesAgo, ms, newest, plural, unknown } from "./shared";

const SOURCE = { name: "WIISARD, data quality in mass-casualty response", url: "https://escholarship.org/uc/item/4b66m6c4" };
const TITLE = "Data freshness by record type";

const TYPE_WORD: Partial<Record<RecordType, string>> = {
  site: "Sites", need: "Needs", road: "Roads", shelter: "Shelters", incident: "Incidents",
};

interface Fact { type: RecordType; id: string; name: string; at: number; q: number }

export function quality(type: RecordType, at: number, now: number): number {
  return 0.5 ** (minutesAgo(at, now) / STALE_AFTER_MIN[type]);
}

function tone(q: number): Tone {
  return q < 0.5 ? "warn" : "ok";
}

export function compute({ board, now }: MetricInput): MetricResult {
  const facts: Fact[] = [];
  let undated = 0;
  const add = (type: RecordType, id: string, name: string, at: number) => {
    if (Number.isNaN(at)) { undated++; return; }
    facts.push({ type, id, name, at, q: quality(type, at, now) });
  };
  for (const s of board.sites) if (s.status !== "retracted") add("site", s._id, s.address, ms(s.observedAt));
  for (const r of board.roads) add("road", r._id, r.road, ms(r.observedAt));
  for (const s of board.shelters) add("shelter", s._id, s.name, ms(s.observedAt));
  for (const n of board.needs) {
    if (n.status === "delivered" || n.status === "cancelled") continue;
    add("need", n._id, n.item, newest(historyTimes(n.history)));
  }
  for (const i of board.incidents) {
    if (i.status === "resolved") continue;
    add("incident", i._id, i.kind.replaceAll("_", " "),newest(historyTimes(i.history).concat((i.actions ?? []).map((a) => ms(a.ts)))));
  }

  if (!facts.length) {
    return unknown("freshness", TITLE, SOURCE,
      "No record on the board has a time yet.",
      `${plural(undated, "record")} without a time`, now);
  }

  const points: MetricPoint[] = [];
  for (const type of Object.keys(TYPE_WORD) as RecordType[]) {
    const of = facts.filter((f) => f.type === type);
    if (!of.length) continue;
    const mean = of.reduce((s, f) => s + f.q, 0) / of.length;
    const low = of.reduce((a, b) => (b.q < a.q ? b : a));
    const stale = of.filter((f) => f.q < 0.5).length;
    points.push({
      label: TYPE_WORD[type]!, value: Math.round(100 * mean), max: 100, tone: tone(mean),
      note: `${plural(of.length, "record")}, ${stale} stale, lowest ${low.name} at ${Math.round(100 * low.q)}%, observed ${agoText(low.at, now)}`,
    });
  }
  const lowest = [...facts].sort((a, b) => a.q - b.q).slice(0, 3);
  for (const f of lowest) {
    points.push({
      label: f.name, value: Math.round(100 * f.q), max: 100, tone: tone(f.q),
      note: `${f.type}, observed ${agoText(f.at, now)}, stale after ${STALE_AFTER_MIN[f.type]} min`,
      recordKey: `${f.type}:${f.id}`,
    });
  }

  const mean = facts.reduce((s, f) => s + f.q, 0) / facts.length;
  const stale = facts.filter((f) => f.q < 0.5);
  const worst = lowest[0];
  return {
    id: "freshness", title: TITLE, source: SOURCE, computedAt: now,
    status: stale.length ? "warn" : "ok",
    headline: `Data quality averages ${Math.round(100 * mean)}% across ${plural(facts.length, "record")}, and ${stale.length} ${stale.length === 1 ? "is" : "are"} stale. The weakest is ${worst.name}, observed ${agoText(worst.at, now)}.`,
    chart: { kind: "bars", unit: "%", points },
    basis: [
      `from ${plural(facts.length, "record")}, newest fact ${agoText(Math.max(...facts.map((f) => f.at)), now)}`,
      "needs and incidents dated by their newest history entry",
      undated ? `${undated} without a time left out` : "",
    ].filter(Boolean).join(", "),
  };
}
