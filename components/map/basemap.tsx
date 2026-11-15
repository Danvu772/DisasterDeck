"use client";
// The map underneath every record. One place, so /map, the board map and the v2 map agree.
//
// Mapbox comes in as raster tiles from the Static Tiles API, so Leaflet and every marker,
// zone and NASA overlay stay as they are. That API serves the classic Mapbox styles and any
// style made in Mapbox Studio, but not Mapbox Standard (docs.mapbox.com/api/maps/static-tiles).
// 512 px tiles sit one zoom level off 256 px ones, hence tileSize 512 and zoomOffset -1.
//
// NEXT_PUBLIC_MAPBOX_TOKEN  a public token (pk.…), restricted to our URLs in the Mapbox account.
// NEXT_PUBLIC_MAPBOX_STYLE  optional, "username/styleId" of a Studio style, shown as "Our style".
// No token: the Esri gray canvas, as before. Next inlines both at build: restart `npm run dev`.
import { useSyncExternalStore } from "react";
import { TileLayer } from "react-leaflet";
import { chip } from "../encode";
import { TILES, TILES_ATTR } from "./markers";

export interface Basemap { id: string; label: string; url: string; attribution: string; tileSize?: number; zoomOffset?: number }

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const CUSTOM = process.env.NEXT_PUBLIC_MAPBOX_STYLE;
const MAPBOX_ATTR = '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> <a href="https://www.mapbox.com/map-feedback/">Improve this map</a>';

const mapbox = (id: string, label: string, style: string): Basemap => ({
  id, label, attribution: MAPBOX_ATTR, tileSize: 512, zoomOffset: -1,
  // {r} is "@2x" on a retina screen and empty otherwise (Leaflet fills it in).
  url: `https://api.mapbox.com/styles/v1/${style}/tiles/512/{z}/{x}/{y}{r}?access_token=${TOKEN}`,
});

const ESRI: Basemap = { id: "esri", label: "Gray (Esri)", url: TILES, attribution: TILES_ATTR };
// Satellite without a Mapbox token: Esri World Imagery, free with attribution.
const ESRI_SAT: Basemap = {
  id: "satellite", label: "Satellite",
  url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community",
};
// Satellite is the default view (Dan, 15 Nov). Markers keep their tier colours on top of it.
const DEFAULT_ID = "satellite";

// Satellite opens by default (DEFAULT_ID). Light is there for when tier red and amber need a calm
// background, night for night operations.
export const BASEMAPS: Basemap[] = TOKEN
  ? [
      ...(CUSTOM ? [mapbox("custom", "Our style", CUSTOM)] : []),
      mapbox("light", "Light", "mapbox/light-v11"),
      mapbox("dark", "Dark", "mapbox/dark-v11"),
      mapbox("night", "Navigation night", "mapbox/navigation-night-v1"),
      mapbox("streets", "Streets", "mapbox/streets-v12"),
      mapbox("outdoors", "Terrain", "mapbox/outdoors-v12"),
      mapbox("satellite", "Satellite", "mapbox/satellite-streets-v12"),
      ESRI,
    ]
  : [ESRI_SAT, ESRI];

// The choice is per viewer, kept in this browser. Every map on the page follows the same store.
const KEY = "desk.basemap";
const listeners = new Set<() => void>();
let memory = "";
function read(): string {
  try { return localStorage.getItem(KEY) ?? ""; } catch { return ""; }
}
function subscribe(fn: () => void) {
  listeners.add(fn);
  window.addEventListener("storage", fn);
  return () => { listeners.delete(fn); window.removeEventListener("storage", fn); };
}
export function setBasemap(id: string) {
  try { localStorage.setItem(KEY, id); } catch { /* private window: the choice lasts this page only */ }
  memory = id;
  listeners.forEach((fn) => fn());
}

export function useBasemap(): Basemap {
  const id = useSyncExternalStore(subscribe, () => memory || read(), () => "");
  return BASEMAPS.find((b) => b.id === id) ?? BASEMAPS.find((b) => b.id === DEFAULT_ID) ?? BASEMAPS[0];
}

/** The tile layer. `extra` is appended to the attribution (zones, NASA atlas). */
export function BasemapTiles({ extra = "" }: { extra?: string }) {
  const b = useBasemap();
  return (
    <TileLayer key={b.id} url={b.url} attribution={`${b.attribution}${extra}`} maxNativeZoom={16} maxZoom={21}
      {...(b.tileSize ? { tileSize: b.tileSize, zoomOffset: b.zoomOffset } : {})} />
  );
}

/** Map style chips. Shows nothing until there is more than one style, i.e. a Mapbox token. */
export function BasemapPicker({ className = "" }: { className?: string }) {
  const current = useBasemap();
  if (BASEMAPS.length < 2) return null;
  return (
    <div role="group" aria-label="Map style" className={`flex flex-wrap items-center gap-1 ${className}`}>
      <span className="mr-1 text-sm text-muted">Map</span>
      {BASEMAPS.map((b) => (
        <button key={b.id} type="button" aria-pressed={b.id === current.id} onClick={() => setBasemap(b.id)}
          className={chip(b.id === current.id)}>
          {b.label}
        </button>
      ))}
    </div>
  );
}
