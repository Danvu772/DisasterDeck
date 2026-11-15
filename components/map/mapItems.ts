// What the map draws, in one shape, whatever API it came from.
// The map never reads Site or Incident directly. Write one adapter per source (fromBoard below
// is the one for GET /api/board) and the map, list and legend work unchanged.
import type { Board, Confidence, Incident, LatLng, RecordType, Site, Source, Tier } from "@/lib/types";
import { severityTier } from "../encode";

export interface MapItem {
  key: string;                 // unique across kinds: "site:<id>", "incident:<id>"
  kind: "site" | "incident";
  title: string;
  coords?: LatLng;             // missing = listed under "No location yet", never guessed
  placedAt?: string;           // set when coords were borrowed from a linked record
  tier: Tier;
  actNow: boolean;
  confidence: Confidence;
  priority?: number;
  support: number;             // different reporters. Drives marker size, like magnitude on USGS
  status: string;
  at: Date | string;           // observedAt: when it was true
  staleType: RecordType;
  source?: Source;
  sources?: number;
  linkTo?: LatLng;             // incident: the site its task was heading to
  record: Site | Incident;     // the raw record, so the list can open the normal card
}

export type MapSource = Pick<Board, "sites" | "incidents" | "tasks" | "needs">;

const CLOSED_SITE = new Set(["closed", "retracted"]);

export function fromBoard(b: MapSource, opts: { showClosed?: boolean } = {}): MapItem[] {
  const siteById = new Map(b.sites.map((s) => [s._id, s]));

  // incident → task → site (directly, or through the need the task delivers)
  function siteOfTask(taskId?: string): Site | undefined {
    const t = taskId ? b.tasks.find((x) => x._id === taskId) : undefined;
    if (!t) return undefined;
    if (t.recordType === "site") return siteById.get(t.recordId);
    if (t.recordType === "need") {
      const n = b.needs.find((x) => x._id === t.recordId);
      return n?.siteIds[0] ? siteById.get(n.siteIds[0]) : undefined;
    }
    return undefined;
  }

  const sites: MapItem[] = b.sites
    .filter((s) => opts.showClosed || !CLOSED_SITE.has(s.status))
    .map((s) => ({
      key: `site:${s._id}`, kind: "site", title: s.address, coords: s.coords,
      tier: s.tier, actNow: s.tier === 0 && s.status === "open",
      confidence: s.confidence, priority: s.priority, support: Math.max(1, s.support),
      status: s.status, at: s.observedAt, staleType: "site",
      source: s.sources[0]?.source, sources: s.sources.length, record: s,
    }));

  const incidents: MapItem[] = b.incidents
    .filter((i) => opts.showClosed || i.status !== "resolved")
    .map((i) => {
      const site = siteOfTask(i.taskId);
      const coords = i.coords ?? site?.coords;
      return {
        key: `incident:${i._id}`, kind: "incident", title: i.kind.replaceAll("_", " "),
        coords, placedAt: !i.coords && site?.coords ? site.address : undefined,
        tier: severityTier(i.severity), actNow: i.severity === "critical",
        confidence: "confirmed" as Confidence,   // a person on the desk reported it
        support: 1, status: i.status,
        at: i.history[0]?.ts ?? i.actions[0]?.ts ?? new Date(),
        staleType: "incident", source: i.reportedBy === "sweeper" ? "system" : "person",
        linkTo: i.coords && site?.coords ? site.coords : undefined,
        record: i,
      };
    });

  // Same order as the board: tier first, then priority. Incidents sit with their tier.
  return [...incidents, ...sites].sort(
    (a, b) => a.tier - b.tier || Number(b.actNow) - Number(a.actNow) || (b.priority ?? 0) - (a.priority ?? 0),
  );
}
