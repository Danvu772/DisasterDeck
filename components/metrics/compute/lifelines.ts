// lifelines, after FEMA Community Lifelines (Transportation): roads by status, each status with its
// evidence. Evidence = non-system history entries and events whose result names the road.
// A status with no evidence on record is flagged, because the desk cannot show why it believes it.
import type { Road } from "@/lib/types";
import type { MetricPoint, MetricResult, Tone } from "../types";
import type { MetricInput } from "../registry";
import { agoText, ms, plural, unknown } from "./shared";

const SOURCE = { name: "FEMA Community Lifelines, Transportation", url: "https://www.cisa.gov/resources-tools/resources/community-lifelines-fact-sheet" };
const TITLE = "Road status and the evidence behind it";
const STATES: Road["state"][] = ["closed", "unconfirmed", "open"];
const STATE_TONE: Record<Road["state"], Tone> = { closed: "warn", unconfirmed: "calm", open: "ok" };
const SOURCE_WORD: Record<string, string> = {
  x: "X", news: "news", reddit: "Reddit", instagram: "Instagram", facebook: "Facebook",
  sheet: "sheet", nasa: "NASA", person: "a person",
};

export function compute({ board, events, now }: MetricInput): MetricResult {
  if (!board.roads.length) {
    return unknown("lifelines", TITLE, SOURCE,
      "There are no roads on the board. Road reports come from closure events through the memory keeper, Role 1.",
      "no road records", now);
  }

  const rows = board.roads.map((r) => {
    const refs = [
      ...(r.history ?? []).filter((e) => e.source !== "system").map((e) => e.source),
      ...(events ?? []).filter((e) => e.source !== "system" && e.result?.recordIds.includes(r._id)).map((e) => e.source),
    ];
    const kinds = [...new Set(refs)].map((s) => SOURCE_WORD[s] ?? s);
    return { r, n: refs.length, kinds, at: ms(r.observedAt) };
  });

  const points: MetricPoint[] = STATES.map((state) => {
    const of = rows.filter((x) => x.r.state === state);
    const bare = of.filter((x) => !x.n).length;
    return {
      label: state[0].toUpperCase() + state.slice(1), value: of.length, tone: STATE_TONE[state],
      note: of.length ? `${of.map((x) => x.r.road).join(", ")}, ${bare ? `${bare} with no evidence` : "all with evidence"}` : "none",
    };
  });
  for (const x of rows) {
    points.push({
      label: `${x.r.road}, ${x.r.state}`, value: x.n, tone: x.n ? STATE_TONE[x.r.state] : "warn",
      note: [
        x.r.confidence,
        x.n ? `${plural(x.n, "report")} from ${x.kinds.join(" and ")}` : "no evidence on record",
        Number.isNaN(x.at) ? "" : `observed ${agoText(x.at, now)}`,
      ].filter(Boolean).join(", "),
      recordKey: `road:${x.r._id}`,
    });
  }

  const count = (s: Road["state"]) => rows.filter((x) => x.r.state === s).length;
  const bare = rows.filter((x) => !x.n);
  const dated = rows.filter((x) => !Number.isNaN(x.at));
  return {
    id: "lifelines", title: TITLE, source: SOURCE, computedAt: now,
    status: bare.length || count("closed") ? "warn" : "ok",
    headline: `${count("closed")} ${count("closed") === 1 ? "road is" : "roads are"} closed, ${count("unconfirmed")} unconfirmed and ${count("open")} open.${
      bare.length ? ` ${bare.length === 1 ? `${bare[0].r.road} has` : `${bare.length} roads have`} no evidence on record.` : " Every status has evidence."}`,
    chart: { kind: "bars", unit: "roads", points },
    basis: [
      `from ${plural(rows.length, "road")}`,
      dated.length ? `newest report ${agoText(Math.max(...dated.map((x) => x.at)), now)}` : "",
      events ? "evidence from history and events" : "evidence from history only, no event list",
    ].filter(Boolean).join(", "),
  };
}
