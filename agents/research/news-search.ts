// Official feed readers (D-0009). The news agent's source, replacing the Claude web search that
// went with the move to gpt-oss on OpenRouter. Three feeds, deterministic parsers, no LLM, no
// search-API call (WS-1):
//   NWS   weather.gov active alerts     → report events (an official advisory about a region)
//   FEMA  OpenFEMA / IPAWS archive     → need (boil water) or report (evacuation, road closure)
//   USGS  earthquake.usgs.gov catalog   → report events (a quake, with its epicentre)
//
// Every feed entry maps onto an existing event type from §4.1, so nothing new is added to the
// schema. An advisory that does not name a known site becomes a report the memory keeper keeps
// in the feed (rejected "a site_update must match a site"): advisories are data, never invented
// records. `dedupeKey` is scoped by desk, because the events index on dedupeKey is unique across
// the whole collection, and the same fixture may be replayed onto more than one desk.
//
// Two modes, one call (collect()):
//   replay  saved raw feed fixtures under agents/fixtures/feeds/, so tests and the demo run
//           without a network
//   live    fetch the real APIs. Best effort: a failing feed logs and the others carry on.

import type { ClosurePayload, NeedPayload, ReportPayload } from "@/lib/types";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type FeedKind = "nws" | "fema" | "usgs";

export const FEED_KINDS: FeedKind[] = ["nws", "fema", "usgs"];

export const FEED_ACTOR: Record<FeedKind, string> = {
  nws: "nws-feed", fema: "fema-feed", usgs: "usgs-feed",
};

/** One feed entry as a schema-checked event, ready to post (minus deskId, which the worker adds). */
export interface FeedEvent {
  type: "report" | "need" | "closure";
  source: "news";
  actor: string;
  dedupeKey: string;
  observedAt?: string;
  payload: ReportPayload | NeedPayload | ClosurePayload;
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const first = (o: unknown, keys: string[]): unknown => {
  if (!o || typeof o !== "object") return undefined;
  for (const k of keys) if ((o as Record<string, unknown>)[k] !== undefined) return (o as Record<string, unknown>)[k];
  return undefined;
};

// ---- fixtures (offline replay) ----

const g = globalThis as unknown as { __feedFixtures?: Record<FeedKind, unknown> };

function fixturePath(kind: FeedKind): string {
  return path.join(process.cwd(), "agents", "fixtures", "feeds", `${kind}.json`);
}

/** The saved raw feed payload for a kind, read once. Throws when the fixture is missing. */
export function readFeedFixture(kind: FeedKind): unknown {
  if (!g.__feedFixtures) g.__feedFixtures = {} as Record<FeedKind, unknown>;
  if (!g.__feedFixtures[kind]) {
    const file = fixturePath(kind);
    if (!existsSync(file)) throw new Error(`no fixture for ${kind}: expected ${file}`);
    g.__feedFixtures[kind] = JSON.parse(readFileSync(file, "utf8"));
  }
  return g.__feedFixtures[kind];
}

// ---- live ----

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
    headers: { accept: "application/geo+json, application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const NWS_QUERY = "https://api.weather.gov/alerts/active?severity=Severe,Extreme&limit=25";
const USGS_QUERY = "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&orderby=time-asc" +
  "&minmagnitude=4.5&starttime=" + encodeURIComponent(new Date(Date.now() - 24 * 3600_000).toISOString());
// OpenFEMA is behind a rate-limited page; the IPAWS archive is the CAP record this parser reads.
const FEMA_QUERY = "https://www.fema.gov/api/open/v1/DisasterDeclarationsSummaries";

async function fetchFeed(kind: FeedKind): Promise<unknown> {
  switch (kind) {
    case "nws": return fetchJson(NWS_QUERY);
    case "usgs": return fetchJson(USGS_QUERY);
    case "fema": {
      // DisasterDeclarationsSummaries has a different shape than the IPAWS archive the parser
      // reads. Normalize the summary into one CAP-ish record per declaration so the same parser
      // serves both, and the IPAWS archive can be slotted in later with no parser change.
      const d = (await fetchJson(FEMA_QUERY)) as { DisasterDeclarationsSummaries?: unknown[] };
      const list = d.DisasterDeclarationsSummaries ?? [];
      return list.slice(0, 25).map((row, i) => ({
        identifier: first(row, ["disasterNumber", "declarationNumber", "id"]) != null
          ? String(first(row, ["disasterNumber", "declarationNumber", "id"])) : `fema-${i}`,
        sent: first(row, ["declarationDate", "incidentBeginDate", "lastRefresh"]),
        info: {
          event: first(row, ["incidentType", "declarationType"]) ?? "Disaster declaration",
          headline: first(row, ["declarationTitle", "title"]) ?? "Federal disaster declared",
          description: first(row, ["designatedArea"]),
          severity: "Severe", urgency: "Expected",
          area: { areaDesc: first(row, ["designatedArea", "state"]) ?? "unknown area" },
        },
      }));
    }
  }
}

// ---- parsing ----

function areaDesc(raw: unknown): string | undefined {
  const a = first(raw, ["areaDesc", "area"]);
  if (typeof a === "string") return a.slice(0, 200);
  if (a && typeof a === "object") {
    const d = first(a, ["areaDesc", "desc", "name"]);
    if (typeof d === "string") return d.slice(0, 200);
  }
  return undefined;
}

function reportEvent(deskId: string, kind: FeedKind, id: string, observedAt: string | undefined,
  p: { text: string; region?: string; hazard?: string; coords?: [number, number] }): FeedEvent {
  const payload: ReportPayload = {
    kind: "site_update",
    text: p.text.slice(0, 5000), textEn: p.text.slice(0, 5000),
    ...(p.region ? { region: p.region } : {}),
    ...(p.hazard ? { hazard: p.hazard.slice(0, 500) } : {}),
    ...(p.coords ? { coords: p.coords } : {}),
  };
  return { type: "report", source: "news", actor: FEED_ACTOR[kind], dedupeKey: `${kind}:${deskId}:${id}`,
    ...(observedAt ? { observedAt } : {}), payload };
}

function parseNws(raw: unknown, deskId: string): FeedEvent[] {
  const features = (first(raw, ["features"]) ?? []) as Record<string, unknown>[];
  const out: FeedEvent[] = [];
  for (const f of features) {
    const props = first(f, ["properties"]); if (!props) continue;
    const id = str(first(f, ["id"])) ?? str(first(props, ["id", "identifier"]));
    const event = str(first(props, ["event"]));
    const headline = str(first(props, ["headline"])) ?? event ?? "National Weather Service alert";
    const sent = str(first(props, ["sent", "effective", "onset"]));
    if (!id) continue;
    const severity = str(first(props, ["severity"]));
    const hazardous = severity === "Severe" || severity === "Extreme";
    out.push(reportEvent(deskId, "nws", id, sent, {
      text: headline,
      region: areaDesc(props),
      ...(hazardous ? { hazard: event ?? "weather alert" } : {}),
    }));
  }
  return out;
}

function parseFema(raw: unknown, deskId: string): FeedEvent[] {
  const records = Array.isArray(raw) ? raw : (first(raw, ["records", "features"]) as unknown[]) ?? [];
  const out: FeedEvent[] = [];
  for (const r0 of records as Record<string, unknown>[]) {
    const info = first(r0, ["info"]);
    const id = str(first(r0, ["identifier", "id"])) ?? "unknown";
    const text = str(first(info ?? r0, ["headline"])) ?? str(first(info ?? r0, ["description"])) ?? "FEMA alert";
    const sent = str(first(r0, ["sent", "effective"]));
    const event = str(first(info ?? r0, ["event"]));
    if (/\b(boil|bottled)\b|\bwater\b/i.test(text) && !/evacuat/i.test(text)) {
      const payload: NeedPayload = { item: "clean water", quantity: 1, lifeThreatening: false,
        region: areaDesc(first(r0, ["area"])) ?? areaDesc(info) };
      out.push({ type: "need", source: "news", actor: FEED_ACTOR.fema, dedupeKey: `fema:${deskId}:${id}`,
        ...(sent ? { observedAt: sent } : {}), payload });
    } else {
      const hazard = /\bevacuat/i.test(text) ? "evacuation" : /\bclos|impassable|blocked/i.test(text) ? "road closure" : event;
      out.push(reportEvent(deskId, "fema", id, sent, {
        text, region: areaDesc(first(r0, ["area"])) ?? areaDesc(info),
        ...(hazard ? { hazard } : {}),
      }));
    }
  }
  return out;
}

function parseUsgs(raw: unknown, deskId: string): FeedEvent[] {
  const features = (first(raw, ["features"]) ?? []) as Record<string, unknown>[];
  const out: FeedEvent[] = [];
  for (const f of features) {
    const id = str(first(f, ["id"]));
    const props = first(f, ["properties"]); if (!id || !props) continue;
    const mag = num(first(props, ["mag"]));
    const place = str(first(props, ["place"])) ?? "earthquake";
    const geom = first(f, ["geometry"]) as Record<string, unknown> | undefined;
    const c = Array.isArray(geom?.coordinates) ? (geom!.coordinates as number[]) : undefined;
    const lon = c?.[0], lat = c?.[1];
    const time = first(props, ["time"]);
    const sent = typeof time === "number" ? new Date(time).toISOString() : str(time);
    out.push(reportEvent(deskId, "usgs", id, sent, {
      text: `M${mag?.toFixed(1) ?? "?"} earthquake near ${place} (USGS ${id})`,
      region: place.slice(0, 200),
      ...(typeof lat === "number" && typeof lon === "number" ? { coords: [lat, lon] as [number, number] } : {}),
    }));
  }
  return out;
}

/** Parse a raw feed payload of one kind into schema-checked events. Pure and deterministic. */
export function parseFeed(kind: FeedKind, raw: unknown, deskId: string): FeedEvent[] {
  switch (kind) {
    case "nws": return parseNws(raw, deskId);
    case "fema": return parseFema(raw, deskId);
    case "usgs": return parseUsgs(raw, deskId);
  }
}

/** What one feed pull needs: which desk to scope dedupeKeys to, and whether to replay offline. */
export interface FeedOptions { deskId: string; replay?: boolean }

/** Read (replay) or fetch (live) one feed and parse it into events. */
export async function collect(kind: FeedKind, opts: FeedOptions): Promise<FeedEvent[]> {
  const raw = opts.replay ? readFeedFixture(kind) : await fetchFeed(kind);
  return parseFeed(kind, raw, opts.deskId);
}
