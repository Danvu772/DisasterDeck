// The basemap under every map, on MapLibre only (D-0006). One place, so /map, the board map, the
// ops map and a map answer all agree.
//
// Basemaps come from Esri (US-hosted, FedRAMP Moderate), as raster tiles from the ArcGIS REST API:
//   World Light Gray Canvas  the USGS default, a calm gray that never competes with tier colours
//   World Dark Gray Canvas   the same, for the dark theme
//   World Imagery            satellite, the default view
// The fallback is our own OSM tiles; until D-0002 puts them on S3, public OSM serves as the
// stand-in. When the Esri source fails to load a tile, BasemapFallback swaps the "base" source to
// OSM in place, so the map keeps working with Esri blocked.
//
// These are raster tiles, so no access token is needed (D-0006 removes the Mapbox token).
import type { StyleSpecification } from "maplibre-gl";

const ESRI_LIGHT_TILES = ["https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"];
const ESRI_DARK_TILES = ["https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"];
const ESRI_SAT_TILES = ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"];
export const OSM_TILES = ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"];

export const ESRI_ATTR = "Tiles &copy; Esri &mdash; Source: Esri, HERE, Garmin, &copy; OpenStreetMap contributors";
export const ESRI_SAT_ATTR = "Imagery &copy; Esri, Maxar, Earthstar Geographics";
export const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// MapLibre draws symbol labels (quake magnitudes) with a font; the style has to point at some glyphs.
export const GLYPHS = "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf";

/** The id of the single raster source every basemap style shares, so BasemapFallback can swap it. */
export const BASE_SOURCE = "base";

function rasterStyle(tiles: string[], attribution: string, tileSize: number, maxzoom: number): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: {
      [BASE_SOURCE]: { type: "raster", tiles, tileSize, maxzoom, attribution },
    },
    layers: [{ id: BASE_SOURCE, type: "raster", source: BASE_SOURCE }],
  };
}

/** The MapLibre style for a theme and view: Esri gray (light/dark) or satellite. */
export function baseStyle(dark: boolean, satellite: boolean): StyleSpecification {
  if (satellite) return rasterStyle(ESRI_SAT_TILES, ESRI_SAT_ATTR, 256, 19);
  return rasterStyle(dark ? ESRI_DARK_TILES : ESRI_LIGHT_TILES, ESRI_ATTR, 256, 19);
}
