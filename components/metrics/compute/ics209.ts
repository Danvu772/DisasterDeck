// ics209, after FEMA ICS Form 209 (Incident Status Summary): one snapshot of the whole board.
// Each line carries the oldest fact behind it, so a reader sees how old the picture is.
// A record's fact time: observedAt where it has one, else its newest history or action entry.
import type { Incident, Task } from "@/lib/types";
import type { MetricResult, Tone } from "../types";
import type { MetricInput } from "../registry";
import { agoText, historyTimes, ms, newest, oldest, pct, plural, unknown } from "./shared";

const SOURCE = { name: "FEMA ICS Form 209, Incident Status Summary", url: "https://training.fema.gov/emiweb/is/icsresource/assets/ics%20forms/ics%20form%20209,%20incident%20status%20summary%20(v3).pdf" };
const TITLE = "Incident status summary";
const SEVERITIES: Incident["severity"][] = ["critical", "high", "low"];
const TASK_ORDER: Task["status"][] = ["escalated", "waiting_approval", "blocked", "created", "assigned", "accepted", "done", "declined", "timed_out", "cancelled"];

type Row = { label: string; value: string; tone?: Tone };

export function compute({ board, now }: MetricInput): MetricResult {
  const { sites, tasks, shelters, roads } = board;
  const incidents = board.incidents.filter((i) => i.status !== "resolved");
  if (!sites.length && !board.incidents.length && !tasks.length && !shelters.length && !roads.length && !board.needs.length) {
    return unknown("ics209", TITLE, SOURCE, "The board is empty. Records come from the memory keeper, Role 1.", "an empty board", now);
  }

  const oldestText = (times: number[]) => {
    const t = oldest(times.filter((x) => !Number.isNaN(x)));
    return Number.isNaN(t) ? "" : `, oldest fact ${agoText(t, now)}`;
  };
  const counts = <T extends string>(xs: T[], order: T[]) =>
    order.map((k) => [k, xs.filter((x) => x === k).length] as const).filter(([, n]) => n > 0)
      .map(([k, n]) => `${n} ${k.replaceAll("_", " ")}`).join(", ");

  const rows: Row[] = [];

  const critical = incidents.filter((i) => i.severity === "critical").length;
  rows.push({
    label: "Open incidents",
    value: incidents.length
      ? `${counts(incidents.map((i) => i.severity), SEVERITIES)}${oldestText(incidents.map((i) => newest(historyTimes(i.history).concat((i.actions ?? []).map((a) => ms(a.ts))))))}`
      : "none",
    tone: critical ? "act" : incidents.length ? "warn" : "ok",
  });

  const live = sites.filter((s) => s.status !== "retracted");
  rows.push({
    label: "Sites",
    value: live.length
      ? `${counts(live.map((s) => s.status), ["open", "team_on_site", "closed"])}${oldestText(live.map((s) => ms(s.observedAt)))}`
      : "none",
    tone: "ink",
  });

  const trappedAt = live.filter((s) => s.status !== "closed" && s.peopleTrapped > 0);
  const trapped = trappedAt.reduce((n, s) => n + s.peopleTrapped, 0);
  const noTeam = trappedAt.filter((s) => s.status === "open");
  rows.push({
    label: "People trapped",
    value: trapped
      ? `${trapped} at ${plural(trappedAt.length, "site")}, ${noTeam.length} without a team${oldestText(trappedAt.map((s) => ms(s.observedAt)))}`
      : "none reported",
    tone: noTeam.length ? "act" : "ink",
  });

  const stuck = tasks.filter((t) => t.status === "escalated" || t.status === "waiting_approval").length;
  rows.push({
    label: "Tasks",
    value: tasks.length ? `${counts(tasks.map((t) => t.status), TASK_ORDER)}${oldestText(tasks.map((t) => newest(historyTimes(t.history))))}` : "none",
    tone: stuck ? "warn" : "ink",
  });

  const used = shelters.reduce((n, s) => n + s.bedsUsed, 0);
  const total = shelters.reduce((n, s) => n + s.bedsTotal, 0);
  rows.push({
    label: "Shelter population",
    value: shelters.length
      ? `${used} of ${total} beds in ${plural(shelters.length, "shelter")}, ${pct(used, total)}% full${oldestText(shelters.map((s) => ms(s.observedAt)))}`
      : "no shelters",
    tone: total && pct(used, total) >= 90 ? "warn" : "ink",
  });

  const closed = roads.filter((r) => r.state === "closed").length;
  rows.push({
    label: "Roads",
    value: roads.length ? `${counts(roads.map((r) => r.state), ["closed", "unconfirmed", "open"])}${oldestText(roads.map((r) => ms(r.observedAt)))}` : "none reported",
    tone: closed ? "warn" : "ink",
  });

  const tones = rows.map((r) => r.tone);
  return {
    id: "ics209", title: TITLE, source: SOURCE, computedAt: now,
    status: tones.includes("act") ? "act" : tones.includes("warn") ? "warn" : "ok",
    headline: `${plural(incidents.length, "open incident")} (${critical} critical), ${trapped} ${trapped === 1 ? "person" : "people"} trapped at ${plural(trappedAt.length, "site")}, ${used} of ${total} shelter beds used, ${plural(closed, "road")} closed.`,
    chart: { kind: "snapshot", rows },
    basis: `from the whole board: ${plural(sites.length, "site")}, ${plural(tasks.length, "task")}, ${plural(board.incidents.length, "incident")}, ${plural(shelters.length, "shelter")} and ${plural(roads.length, "road")}`,
  };
}
