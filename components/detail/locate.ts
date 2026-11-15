// Where a record is, and what it links to. Pure, from the board the page already polls.
// Never guesses a position: no coords on the record or on what it points to means null.
import type { Incident, LatLng, Need, Road, Shelter, Site, Task } from "@/lib/types";
import type { Board } from "../BoardCards";
import { severityTier } from "../encode";
import { siteOfTask } from "../map/mapItems";

export type DetailKind = "site" | "need" | "shelter" | "road" | "incident" | "task";
export type AnyRecord = Site | Need | Shelter | Road | Incident | Task;

const LISTS: Record<DetailKind, keyof Board> = {
  site: "sites", need: "needs", shelter: "shelters", road: "roads", incident: "incidents", task: "tasks",
};

export function parseKey(key: string | null): { kind: DetailKind; id: string } | null {
  const at = key?.indexOf(":") ?? -1;
  if (!key || at < 1) return null;
  const kind = key.slice(0, at) as DetailKind;
  return kind in LISTS ? { kind, id: key.slice(at + 1) } : null;
}

export function findRecord(board: Board, kind: string, id: string): AnyRecord | undefined {
  const list = LISTS[kind as DetailKind];
  return list ? (board[list] as AnyRecord[]).find((r) => r._id === id) : undefined;
}

export interface Location {
  coords: LatLng;
  key: string;                                 // the map item to ring, "<kind>:<id>"
  via?: { kind: DetailKind; label: string };   // set when the position belongs to another record
}

export function locate(kind: DetailKind, record: AnyRecord, board: Board, depth = 0): Location | null {
  const own = (record as { coords?: LatLng }).coords;
  if (kind !== "need" && kind !== "task" && own) return { coords: own, key: `${kind}:${record._id}` };

  if (kind === "incident") {
    // fromBoard draws a coord-less incident at its task's site, under the incident's own key
    const site = siteOfTask(board, (record as Incident).taskId);
    return site?.coords ? { coords: site.coords, key: `incident:${record._id}`, via: { kind: "site", label: site.address } } : null;
  }
  if (kind === "need") {
    const site = (record as Need).siteIds.map((id) => board.sites.find((s) => s._id === id)).find((s) => s?.coords);
    return site?.coords ? { coords: site.coords, key: `site:${site._id}`, via: { kind: "site", label: site.address } } : null;
  }
  if (kind === "task" && depth < 3) {
    const t = record as Task;
    const target = findRecord(board, t.recordType, t.recordId);
    const loc = target && locate(t.recordType as DetailKind, target, board, depth + 1);
    return loc ? { ...loc, via: loc.via ?? { kind: t.recordType as DetailKind, label: summary(t.recordType as DetailKind, target).title } } : null;
  }
  return null;
}

// Incident kinds as a person says them.
export const INCIDENT_WORD: Record<string, string> = {
  vehicle_breakdown: "Vehicle broke down", road_blocked: "Road blocked", cannot_find: "Cannot find the place",
  short_supply: "Short on supplies", unsafe: "Unsafe to continue", injury: "Someone is injured",
  handover: "Handover needed", unreachable: "Cannot be reached", other: "Problem in the field",
};

// The words a card leads with. Mirrors BoardCards so the panel title matches the card.
export function summary(kind: DetailKind, r: AnyRecord, now = Date.now()): { title: string; tier: 0 | 1 | 2; priority?: number; status: string; confidence: string; actNow: boolean } {
  switch (kind) {
    case "site": { const s = r as Site; return { title: s.address, tier: s.tier, priority: s.priority, status: s.status, confidence: s.confidence, actNow: s.tier === 0 && s.status === "open" }; }
    case "need": { const n = r as Need; return { title: `${n.quantity} ${n.item}`, tier: n.tier, priority: n.priority, status: n.status, confidence: n.confidence, actNow: false }; }
    case "shelter": { const h = r as Shelter; return { title: h.name, tier: h.bedsUsed / h.bedsTotal > 0.9 ? 1 : 2, status: `${h.bedsUsed} of ${h.bedsTotal} beds`, confidence: "confirmed", actNow: false }; }
    case "road": { const d = r as Road; return { title: d.road, tier: 1, status: d.state, confidence: d.confidence, actNow: false }; }
    case "incident": { const i = r as Incident; return { title: INCIDENT_WORD[i.kind] ?? i.kind.replaceAll("_", " "), tier: severityTier(i.severity), status: i.status, confidence: "confirmed", actNow: i.severity === "critical" }; }
    case "task": { const t = r as Task; return { title: t.title, tier: t.tier, priority: t.priority, status: t.status, confidence: "confirmed", actNow: t.open && new Date(t.deadline).getTime() < now }; }
  }
}

export interface Link { key: string; kind: DetailKind; why: string; record?: AnyRecord }

// Linked records, each one a key the panel can switch to. `record` is missing when the
// board does not hold it (yet), so the panel can say so instead of dropping the link.
export function links(kind: DetailKind, r: AnyRecord, board: Board): Link[] {
  const to = (k: DetailKind, id: string, why: string): Link => ({ key: `${k}:${id}`, kind: k, why, record: findRecord(board, k, id) });
  switch (kind) {
    case "site": {
      const tasks = board.tasks.filter((t) => t.recordType === "site" && t.recordId === r._id);
      const needs = board.needs.filter((n) => n.siteIds.includes(r._id));
      const incidents = board.incidents.filter((i) => siteOfTask(board, i.taskId)?._id === r._id);
      return [
        ...tasks.map((t) => to("task", t._id, "Task")),
        ...needs.map((n) => to("need", n._id, "Need at this site")),
        ...incidents.map((i) => to("incident", i._id, "Problem on a task for this site")),
      ];
    }
    case "need": {
      const n = r as Need;
      return [
        ...n.siteIds.map((id) => to("site", id, "Site")),
        ...board.tasks.filter((t) => t.recordType === "need" && t.recordId === n._id).map((t) => to("task", t._id, "Task")),
      ];
    }
    case "task": {
      const t = r as Task;
      const out = t.recordType === "zone" ? [] : [to(t.recordType as DetailKind, t.recordId, "About")];
      if (t.blockedBy) out.push(to("incident", t.blockedBy, "Blocked by"));
      if (t.replaces) out.push(to("task", t.replaces, "Replaces"));
      return out;
    }
    case "incident": {
      const i = r as Incident;
      const site = siteOfTask(board, i.taskId);
      return [
        ...(i.taskId ? [to("task", i.taskId, "Task")] : []),
        ...(site ? [to("site", site._id, "Site the task was heading to")] : []),
      ];
    }
    default: return [];
  }
}
