// How a record is drawn on any map. /map and the detail panel both draw through here,
// so the same record gets the same marker in both places. Imports Leaflet: client only.
import L from "leaflet";
import { confidenceBorder, isStale, markerSize, staleInk, tierBar } from "../encode";
import type { MapItem } from "./mapItems";

// Esri World Light Gray Canvas, the USGS default basemap. Gray, so no hue competes with ours.
export const TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}";
export const TILES_ATTR = "Tiles &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors";

// Road: a short bar at one point. Closed is a thick solid ink outline, unconfirmed is dashed.
const ROAD_W = 24, ROAD_H = 10;
export const roadLine = (closed: boolean) => (closed ? "border-4 border-solid border-ink" : "border-2 border-dashed border-ink");

// `context`: drawn faded, behind the one record the panel is about.
// `motion`: a one-pass class from globals.css (map-ring, map-flash). Empty when nothing should move.
export function icon(it: MapItem, selected: boolean, now: number, context = false, motion = ""): L.DivIcon {
  const fade = context ? "opacity-50" : staleInk(isStale(it.staleType, it.at, now));
  const ring = selected ? "ring-4 ring-primary" : "";
  if (it.kind === "road") {
    return L.divIcon({
      className: "",
      iconSize: [ROAD_W, ROAD_H],
      iconAnchor: [ROAD_W / 2, ROAD_H / 2],
      html: `<span class="block bg-card ${roadLine(it.status === "closed")} ${ring} ${fade}" style="width:${ROAD_W}px;height:${ROAD_H}px"></span>`,
    });
  }
  const s = markerSize(it.support);
  const shape = it.kind === "incident" ? "rotate-45 rounded-tag" : it.kind === "shelter" ? "rounded-tag" : "rounded-full";
  return L.divIcon({
    className: "",
    iconSize: [s, s],
    iconAnchor: [s / 2, s / 2],
    html: `<span class="block ${shape} ${tierBar(it.tier, it.actNow)} ${confidenceBorder(it.confidence)} ${ring} ${fade} ${motion}" style="width:${s}px;height:${s}px"></span>`,
  });
}

// Only the selected ring, for a record the map has no marker for (an open road).
export function ringIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    html: `<span class="block h-full w-full rounded-full bg-card ring-4 ring-primary"></span>`,
  });
}
