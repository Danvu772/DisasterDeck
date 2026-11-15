// shelters, after the FEMA ESF#6 Shelter System (formerly NSS): per shelter the name, status
// (open, full, closed), capacity, population, beds free, percent full, and the age of the count.
// Our Shelter record has no status field, so it comes from the numbers: no beds at all is closed,
// every bed used is full, anything else is open. The age is from observedAt, when the count was true.
import { STALE_AFTER_MIN } from "../../encode";
import type { MetricPoint, MetricResult, Tone } from "../types";
import type { MetricInput } from "../registry";
import { agoText, minutesAgo, ms, pct, plural, unknown } from "./shared";

const SOURCE = { name: "FEMA ESF#6 Shelter System, formerly the National Shelter System", url: "https://gis.fema.gov/arcgis/rest/services/NSS/OpenShelters/MapServer" };
const TITLE = "Shelter beds used of total";
const NEARLY_FULL = 90; // percent

type Status = "open" | "full" | "closed";

export function compute({ board, now }: MetricInput): MetricResult {
  if (!board.shelters.length) {
    return unknown("shelters", TITLE, SOURCE,
      "There are no shelters on the board. Shelters come from the seed data and capacity reports, Role 1.",
      "no shelter records", now);
  }

  const rows = board.shelters.map((s) => {
    const status: Status = s.bedsTotal <= 0 ? "closed" : s.bedsUsed >= s.bedsTotal ? "full" : "open";
    const at = ms(s.observedAt);
    const stale = !Number.isNaN(at) && minutesAgo(at, now) > STALE_AFTER_MIN.shelter;
    return { s, status, at, stale, free: Math.max(0, s.bedsTotal - s.bedsUsed), full: pct(s.bedsUsed, s.bedsTotal) };
  }).sort((a, b) => b.full - a.full);

  const tone = (r: (typeof rows)[number]): Tone =>
    r.status === "full" ? "act" : r.full >= NEARLY_FULL ? "warn" : r.status === "closed" ? "calm" : "ok";

  const points: MetricPoint[] = rows.map((r) => ({
    label: r.s.name, value: r.s.bedsUsed, max: r.s.bedsTotal, tone: tone(r),
    note: [
      `${r.status}, ${r.s.bedsUsed} of ${r.s.bedsTotal} beds, ${r.free} free, ${r.full}% full`,
      Number.isNaN(r.at) ? "count has no time" : `counted ${agoText(r.at, now)}${r.stale ? ", stale" : ""}`,
    ].join(", "),
    recordKey: `shelter:${r.s._id}`,
  }));

  const open = rows.filter((r) => r.status !== "closed");
  const used = open.reduce((n, r) => n + r.s.bedsUsed, 0);
  const total = open.reduce((n, r) => n + r.s.bedsTotal, 0);
  const free = open.reduce((n, r) => n + r.free, 0);
  const fullest = rows[0];
  const stale = rows.filter((r) => r.stale);
  const dated = rows.filter((r) => !Number.isNaN(r.at));

  const parts = [
    `${plural(open.length, "shelter")} ${open.length === 1 ? "has" : "have"} ${free} free ${free === 1 ? "bed" : "beds"} left, ${used} of ${total} used (${pct(used, total)}% full).`,
    `${fullest.s.name} is the fullest at ${fullest.s.bedsUsed} of ${fullest.s.bedsTotal}${Number.isNaN(fullest.at) ? "" : `, counted ${agoText(fullest.at, now)}`}.`,
  ];
  if (stale.length) parts.push(`${plural(stale.length, "count")} ${stale.length === 1 ? "is" : "are"} older than ${STALE_AFTER_MIN.shelter} min.`);

  return {
    id: "shelters", title: TITLE, source: SOURCE, computedAt: now,
    status: rows.some((r) => r.status === "full") ? "act" : rows.some((r) => r.full >= NEARLY_FULL) || stale.length ? "warn" : "ok",
    headline: parts.join(" "),
    chart: { kind: "bars", unit: "beds", points },
    basis: [
      `from ${plural(rows.length, "shelter")}`,
      dated.length ? `newest count ${agoText(Math.max(...dated.map((r) => r.at)), now)}` : "no count has a time",
      "status read from the bed numbers",
    ].join(", "),
  };
}
