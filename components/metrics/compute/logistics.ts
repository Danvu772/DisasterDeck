// logistics, after Beamon & Balcik 2008: fill rate (quantity delivered over quantity requested)
// and delivery time (need opened to delivered), plus needs open for more than 60 min.
// Opened = the need's first history entry. Delivered = the first history entry that says delivered,
// else its last entry once the status is delivered. Proposed needs (waiting for more voices) and
// cancelled needs are not requests yet, so they stay out of the fill rate.
import type { Need } from "@/lib/types";
import type { MetricPoint, MetricResult } from "../types";
import type { MetricInput } from "../registry";
import { agoText, historyTimes, minText, minutesAgo, ms, oldest, pct, percentile, plural, unknown } from "./shared";

const SOURCE = { name: "Beamon and Balcik 2008, performance measurement in humanitarian relief chains", url: "https://www.emerald.com/insight/content/doi/10.1108/09513550810846087/full/html" };
const TITLE = "Needs filled and delivery time";
const LATE_MIN = 60;
const OPEN = new Set<Need["status"]>(["open", "assigned", "on_the_way"]);
const DELIVERED = /\bdelivered\b/i;

function deliveredAt(n: Need): number {
  const h = (n.history ?? []).map((e) => ({ t: ms(e.ts), reason: e.reason ?? "" })).filter((e) => !Number.isNaN(e.t));
  const said = oldest(h.filter((e) => DELIVERED.test(e.reason) && e.t > oldest(h.map((x) => x.t))).map((e) => e.t));
  if (!Number.isNaN(said)) return said;
  return h.length > 1 ? Math.max(...h.map((e) => e.t)) : NaN;
}

export function compute({ board, now }: MetricInput): MetricResult {
  const asked = board.needs.filter((n) => n.status !== "proposed" && n.status !== "cancelled");
  if (!asked.length) {
    return unknown("logistics", TITLE, SOURCE,
      "No need on the board has been opened yet. Needs come from the memory keeper and the dispatcher, Role 1.",
      `${plural(board.needs.length, "need")}, none past proposed`, now);
  }

  const requested = asked.reduce((s, n) => s + n.quantity, 0);
  const delivered = asked.filter((n) => n.status === "delivered");
  const filled = delivered.reduce((s, n) => s + n.quantity, 0);
  const fill = pct(filled, requested);

  const times: number[] = [];
  for (const n of delivered) {
    const start = oldest(historyTimes(n.history));
    const end = deliveredAt(n);
    if (!Number.isNaN(start) && !Number.isNaN(end)) times.push((end - start) / 60000);
  }
  const median = percentile(times, 0.5);

  const open = asked.filter((n) => OPEN.has(n.status)).map((n) => ({ n, opened: oldest(historyTimes(n.history)) }));
  const late = open.filter((o) => !Number.isNaN(o.opened) && minutesAgo(o.opened, now) > LATE_MIN)
    .sort((a, b) => a.opened - b.opened);
  const lateLife = late.filter((o) => o.n.tier === 0 || o.n.lifeThreatening);

  const points: MetricPoint[] = [
    { label: "Fill rate, percent", value: fill, max: 100, tone: fill >= 90 ? "ok" : "warn",
      note: `${filled} of ${requested} items delivered, ${delivered.length} of ${plural(asked.length, "need")}` },
  ];
  if (times.length) {
    points.push({ label: "Median delivery time, min", value: Math.round(median), tone: median > LATE_MIN ? "warn" : "ok",
      note: `from ${plural(times.length, "delivery", "deliveries")}, slowest ${minText(Math.max(...times))}` });
  }
  points.push({ label: `Open over ${LATE_MIN} min`, value: late.length, max: open.length,
    tone: lateLife.length ? "act" : late.length ? "warn" : "ok", note: `${late.length} of ${plural(open.length, "open need")}` });
  for (const o of late.slice(0, 3)) {
    points.push({
      label: o.n.item, value: Math.round(minutesAgo(o.opened, now)), tone: o.n.tier === 0 || o.n.lifeThreatening ? "act" : "warn",
      note: `${o.n.quantity} asked, ${o.n.status.replaceAll("_", " ")}, opened ${agoText(o.opened, now)}`,
      recordKey: `need:${o.n._id}`,
    });
  }

  const parts = [`${fill}% of requested items are delivered, ${filled} of ${requested}.`];
  parts.push(times.length
    ? `Half the deliveries took ${minText(median)} or less.`
    : "Nothing has a delivery time yet.");
  parts.push(late.length
    ? `${plural(late.length, "need")} ${late.length === 1 ? "has" : "have"} been open over ${LATE_MIN} min, the oldest is ${late[0].n.item}.`
    : `No need has been open over ${LATE_MIN} min.`);

  const opened = asked.map((n) => oldest(historyTimes(n.history))).filter((t) => !Number.isNaN(t));
  return {
    id: "logistics", title: TITLE, source: SOURCE, computedAt: now,
    status: lateLife.length ? "act" : late.length || fill < 50 ? "warn" : "ok",
    headline: parts.join(" "),
    chart: { kind: "bars", points },
    basis: [
      `from ${plural(asked.length, "need")}`,
      opened.length ? `newest opened ${agoText(Math.max(...opened), now)}` : "",
      "proposed and cancelled needs left out",
    ].filter(Boolean).join(", "),
  };
}
