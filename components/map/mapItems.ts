// What the map draws, in one shape, whatever API it came from.
// The map never reads Site or Incident directly. Write one adapter per source (fromBoard below
// is the one for GET /api/board) and the map, list and legend work unchanged.
import type { Board, Confidence, Incident, LatLng, RecordType, Road, Shelter, Site, Source, Tier } from "@/lib/types";
import { severityTier } from "../encode";

export interface MapItem {
  key: string;                 // unique across kinds: "site:<id>", "incident:<id>"
  kind: "site" | "incident" | "shelter" | "road";
  title: string;
  note?: string;               // one plain line under the title (a road's reason)
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
  record: Site | Incident | Shelter | Road;     // the raw record, so the list can open the normal card
}

export type MapSource = Pick<Board, "sites" | "incidents" | "tasks" | "needs" | "shelters" | "roads">;

const CLOSED_SITE = new Set(["closed", "retracted"]);

// incident → task → site (directly, or through the need the task delivers).
// The board's "Incident sites" tab and the detail panel use the same chain.
export function siteOfTask(b: Pick<MapSource, "sites" | "tasks" | "needs">, taskId?: string): Site | undefined {
  const t = taskId ? b.tasks.find((x) => x._id === taskId) : undefined;
  if (!t) return undefined;
  if (t.recordType === "site") return b.sites.find((s) => s._id === t.recordId);
  if (t.recordType === "need") {
    const n = b.needs.find((x) => x._id === t.recordId);
    return n?.siteIds[0] ? b.sites.find((s) => s._id === n.siteIds[0]) : undefined;
  }
  return undefined;
}

export function fromBoard(b: MapSource, opts: { showClosed?: boolean } = {}): MapItem[] {
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
      const site = siteOfTask(b, i.taskId);
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

  // Full or above 90% is urgent, otherwise calm. Never act-now red.
  const shelters: MapItem[] = b.shelters.map((h) => {
    const full = h.bedsUsed >= h.bedsTotal || h.bedsUsed > 0.9 * h.bedsTotal;
    return {
      key: `shelter:${h._id}`, kind: "shelter", title: `${h.name}, ${h.bedsUsed} of ${h.bedsTotal} beds`,
      coords: h.coords, tier: (full ? 1 : 2) as Tier, actNow: false,
      confidence: "confirmed" as Confidence, support: 1, status: full ? "full" : "open",
      at: h.observedAt, staleType: "shelter", record: h,
    };
  });

  // Open roads are not drawn. Closed and unconfirmed ones are, as a marker at one point.
  const roads: MapItem[] = b.roads
    .filter((r) => r.state !== "open")
    .map((r) => ({
      key: `road:${r._id}`, kind: "road", title: r.road, note: r.reason,
      coords: r.coords, tier: 2 as Tier, actNow: false,
      confidence: r.state === "closed" ? "confirmed" as Confidence : "unconfirmed" as Confidence,
      support: 1, status: r.state, at: r.observedAt, staleType: "road", record: r,
    }));

  // Same order as the board: tier first, then priority. Incidents sit with their tier.
  // Shelters and roads come after, the list shows them in their own section.
  const core = [...incidents, ...sites].sort(
    (a, b) => a.tier - b.tier || Number(b.actNow) - Number(a.actNow) || (b.priority ?? 0) - (a.priority ?? 0),
  );
  return [...core, ...shelters, ...roads];
}
