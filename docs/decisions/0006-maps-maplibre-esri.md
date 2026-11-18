# D-0006 Maps: MapLibre with Esri basemaps

- **Date:** 2026-11-17
- **Status:** accepted
- **Decided by:** Dan Vu (design owner). Ömer to sign off on `docs/SYSTEM_DESIGN.md`
- **Dissent:** none recorded

## Context
The app ships both MapLibre and Leaflet, and uses Mapbox basemaps when a token is set. Emergency management agencies already run ArcGIS.

## Decision
MapLibre is the only renderer. Basemaps come from Esri (US-hosted, FedRAMP Moderate), with our own OSM tiles on AWS as the fallback when vendors are down. Drop Mapbox and Leaflet.

## Consequences
Remove `leaflet`, `react-leaflet` and the Mapbox token. The Maxar, HOT/OSM and NASA evidence layers stay. ArcGIS layer import becomes possible later.
