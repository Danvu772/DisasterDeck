// What the board list draws, from the board the page already polls. Pure.
// One filter per v1 tab plus All. Sites and the problems on their tasks share a filter,
// so a reader sees the problem right under the place (t21).
import type { Incident, Site } from "@/lib/types";
import type { Board } from "../BoardCards";
import { severityTier } from "../encode";
import { type AnyRecord, type DetailKind, summary } from "../detail/locate";
import { siteOfTask } from "../map/mapItems";

export const FILTERS = [
  { id: "all", label: "All" },
  { id: "incident_sites", label: "Sites" },
  { id: "needs", label: "Needs" },
  { id: "shelters", label: "Shelters" },
  { id: "roads", label: "Roads" },
  { id: "tasks", label: "Tasks" },
] as const;
export type Filter = (typeof FILTERS)[number]["id"];
type KindFilter = Exclude<Filter, "all">;

export const FILTER_OF: Record<DetailKind, KindFilter> = {
  site: "incident_sites", incident: "incident_sites", need: "needs", shelter: "shelters", road: "roads", task: "tasks",
};

const openIncident = (i: Incident) => i.status !== "resolved";

// The red count. Same rules as v1's tabs, so nothing tier 0 hides behind a filter you are not on.
export function isActNow(kind: DetailKind, r: AnyRecord): boolean {
  switch (kind) {
    case "site": { const s = r as Site; return s.tier === 0 && s.status !== "closed"; }
    case "incident": { const i = r as Incident; return i.severity === "critical" && openIncident(i); }
    case "need": { const n = r as Board["needs"][number]; return n.tier === 0 && n.status !== "delivered"; }
    case "task": { const t = r as Board["tasks"][number]; return t.open && t.tier === 0; }
    default: return false;
  }
}

export interface Row { key: string; kind: DetailKind; record: AnyRecord; indent: boolean }

const row = (kind: DetailKind, record: AnyRecord, indent = false): Row => ({ key: `${kind}:${record._id}`, kind, record, indent });

// Sites and incidents, by tier then priority. An incident whose task points at a site
// (directly, or through the need it delivers) sits under that site instead.
function incidentSiteGroups(board: Board): Row[][] {
  const under = new Map<string, Incident[]>();
  const loose: Incident[] = [];
  for (const i of board.incidents) {
    const site = siteOfTask(board, i.taskId);
    if (site) under.set(site._id, [...(under.get(site._id) ?? []), i]);
    else loose.push(i);
  }
  const byTier = (i: Incident) => severityTier(i.severity);
  return [
    ...board.sites.map((s) => [row("site", s), ...(under.get(s._id) ?? []).sort((a, b) => byTier(a) - byTier(b)).map((i) => row("incident", i, true))]),
    ...loose.map((i) => [row("incident", i)]),
  ];
}

// Incidents have no priority score. A critical one leads its tier. Shelters and roads have none either, they go last.
function rank(r: Row, now: number): { tier: number; priority: number } {
  const s = summary(r.kind, r.record, now);
  if (r.kind === "incident") return { tier: s.tier, priority: (r.record as Incident).severity === "critical" ? Infinity : -1 };
  return { tier: s.tier, priority: s.priority ?? -2 };
}

function sortGroups(groups: Row[][], now: number): Row[][] {
  return groups.sort((a, b) => {
    const x = rank(a[0], now), y = rank(b[0], now);
    return x.tier - y.tier || (y.priority > x.priority ? 1 : y.priority < x.priority ? -1 : 0);
  });
}

// One list per filter. All mixes every kind by tier then priority, the others keep the order the board gives.
export function listRows(board: Board, filter: Filter, now: number): Row[] {
  switch (filter) {
    case "incident_sites": return sortGroups(incidentSiteGroups(board), now).flat();
    case "needs": return board.needs.map((n) => row("need", n));
    case "shelters": return board.shelters.map((s) => row("shelter", s));
    case "roads": return board.roads.map((r) => row("road", r));
    case "tasks": return board.tasks.map((t) => row("task", t));
    case "all": return sortGroups([
      ...incidentSiteGroups(board),
      ...board.needs.map((n) => [row("need", n)]),
      ...board.tasks.map((t) => [row("task", t)]),
      ...board.shelters.map((s) => [row("shelter", s)]),
      ...board.roads.map((r) => [row("road", r)]),
    ], now).flat();
  }
}

// The chip numbers. Resolved incidents leave the count, as on v1's tab.
export function counts(board: Board, filter: Filter): { total: number; act: number } {
  const rows = listRows(board, filter, 0).filter((r) => r.kind !== "incident" || openIncident(r.record as Incident));
  return { total: rows.length, act: rows.filter((r) => isActNow(r.kind, r.record)).length };
}

// With nothing open, the detail column shows the first act-now record on the full list.
export function firstActNow(board: Board, now: number): string | null {
  return listRows(board, "all", now).find((r) => isActNow(r.kind, r.record))?.key ?? null;
}
