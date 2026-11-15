// Earthquakes and aftershocks near the desk. Plain code, no LLM, no cost.
//
// Two modes, one clock:
//   replay  the scenario runs in February 2023. Quakes come from agents/fixtures/usgs-kahramanmaras-2023.json
//           (USGS catalog, cached so the demo works offline). workers/quake-watcher.ts --replay writes
//           the scenario clock to agents/.replay/clock.json; every process reads the same clock.
//   live    no clock file. Quakes come from AFAD (Türkiye, neighbourhood-level) and USGS (world),
//           polled at most once a minute.
//
// Checked 15 Nov 2026: USGS returns the 6 Feb 2023 sequence; AFAD's API returns this week's quakes
// but nothing for 2023, so replay uses USGS.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { LatLng } from "@/lib/types";

export interface Quake {
  id: string;            // catalog id, e.g. "us6000jllz" or "afad:734209"
  time: string;          // ISO, UTC
  mag: number;
  place: string;
  lat: number;
  lon: number;
  depthKm: number;
  catalog: "USGS" | "AFAD";
}

/** Malatya city centre: the desk's default point when a person has no position. */
export const DESK_CENTER: LatLng = [38.355, 38.309];

// ---------- the scenario clock ----------

const CLOCK = path.join(process.cwd(), "agents", ".replay", "clock.json");

interface Clock { scenarioStart: string; wallStart: string; speed: number }

export function startReplayClock(scenarioStart: string, speed: number): void {
  mkdirSync(path.dirname(CLOCK), { recursive: true });
  writeFileSync(CLOCK, JSON.stringify({ scenarioStart, wallStart: new Date().toISOString(), speed }));
}

export function stopReplayClock(): void {
  try { writeFileSync(CLOCK, ""); } catch { /* nothing to stop */ }
}

function readClock(): Clock | undefined {
  try {
    if (!existsSync(CLOCK)) return undefined;
    const raw = readFileSync(CLOCK, "utf8").trim();
    return raw ? (JSON.parse(raw) as Clock) : undefined;
  } catch { return undefined; }
}

/** "Now" in the scenario: February 2023 during a replay, the real time otherwise. */
export function scenarioNow(): { now: Date; replay: boolean } {
  const c = readClock();
  if (!c) return { now: new Date(), replay: false };
  const elapsed = Date.now() - Date.parse(c.wallStart);
  return { now: new Date(Date.parse(c.scenarioStart) + elapsed * c.speed), replay: true };
}

// ---------- catalogs ----------

let cached2023: Quake[] | undefined;
export function replayCatalog(): Quake[] {
  if (!cached2023) {
    const file = path.join(process.cwd(), "agents", "fixtures", "usgs-kahramanmaras-2023.json");
    const raw = JSON.parse(readFileSync(file, "utf8")) as { events: Omit<Quake, "catalog">[] };
    cached2023 = raw.events.map((e) => ({ ...e, catalog: "USGS" as const }));
  }
  return cached2023;
}

async function fetchUsgs(since: Date): Promise<Quake[]> {
  const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&orderby=time-asc&minmagnitude=4` +
    `&starttime=${since.toISOString()}&minlatitude=35&maxlatitude=43&minlongitude=25&maxlongitude=45`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`USGS ${res.status}`);
  const d = (await res.json()) as { features: { id: string; properties: { time: number; mag: number; place: string }; geometry: { coordinates: number[] } }[] };
  return d.features.map((f) => ({
    id: f.id, time: new Date(f.properties.time).toISOString(), mag: f.properties.mag, place: f.properties.place,
    lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], depthKm: f.geometry.coordinates[2], catalog: "USGS",
  }));
}

async function fetchAfad(since: Date): Promise<Quake[]> {
  const fmt = (d: Date) => d.toISOString().slice(0, 19);
  const url = `https://servisnet.afad.gov.tr/apigateway/deprem/apiv2/event/filter?start=${fmt(since)}&end=${fmt(new Date())}&minmag=4`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`AFAD ${res.status}`);
  const d = (await res.json()) as { eventID: string; date: string; magnitude: string; location: string; latitude: string; longitude: string; depth: string }[];
  return d.map((e) => ({
    // AFAD's "date" has no zone but is UTC: checked against USGS for the same quake (Kozan, 9 Nov 2026).
    id: `afad:${e.eventID}`, time: e.date.endsWith("Z") ? e.date : `${e.date}Z`, mag: Number(e.magnitude), place: e.location,
    lat: Number(e.latitude), lon: Number(e.longitude), depthKm: Number(e.depth), catalog: "AFAD",
  }));
}

const g = globalThis as unknown as { __quakeLive?: { at: number; quakes: Quake[] } };

/** Live quakes of the last 24 h, from AFAD and USGS, fetched at most once a minute. */
export async function liveCatalog(): Promise<Quake[]> {
  const hit = g.__quakeLive;
  if (hit && Date.now() - hit.at < 60_000) return hit.quakes;
  const since = new Date(Date.now() - 24 * 3600_000);
  const [afad, usgs] = await Promise.allSettled([fetchAfad(since), fetchUsgs(since)]);
  const quakes = [
    ...(afad.status === "fulfilled" ? afad.value : []),
    ...(usgs.status === "fulfilled" ? usgs.value : []),
  ].sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  g.__quakeLive = { at: Date.now(), quakes };
  return quakes;
}

// ---------- what matters to a person ----------

export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Is this quake worth a warning at this distance? A rough felt-shaking rule, not science:
 * M5 within 100 km, M6 within 200 km, M7 within 400 km. Damaged buildings fail in shaking
 * that intact ones survive, so the bar is low on purpose.
 */
export function worthWarning(mag: number, km: number): boolean {
  return (mag >= 5 && km <= 100) || (mag >= 6 && km <= 200) || (mag >= 7 && km <= 400);
}

export interface NearbyQuake extends Quake { km: number; minutesAgo: number }

/** Quakes worth a warning near `where`, in the last `withinMinutes` of scenario time, newest first. */
export async function recentQuakesNear(where: LatLng | undefined, withinMinutes = 60): Promise<{ quakes: NearbyQuake[]; now: Date; replay: boolean }> {
  const { now, replay } = scenarioNow();
  let all: Quake[];
  try { all = replay ? replayCatalog() : await liveCatalog(); } catch { all = []; }
  const at = where ?? DESK_CENTER;
  const quakes = all
    .map((q) => ({ ...q, km: Math.round(distanceKm(at, [q.lat, q.lon])),
      minutesAgo: Math.round((+now - Date.parse(q.time)) / 60000) }))
    .filter((q) => q.minutesAgo >= 0 && q.minutesAgo <= withinMinutes && worthWarning(q.mag, q.km))
    .sort((a, b) => a.minutesAgo - b.minutesAgo);
  return { quakes, now, replay };
}

export function quakeLine(q: NearbyQuake): string {
  return `M${q.mag.toFixed(1)} · ${q.km} km away · ${q.minutesAgo} min ago · ${q.place} · depth ${q.depthKm} km · source ${q.catalog} (${q.id})`;
}
