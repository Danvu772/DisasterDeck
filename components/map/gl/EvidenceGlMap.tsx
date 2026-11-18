"use client";
// The evidence view of the map, on MapLibre (D-0006). What the old Leaflet "imagery" mode showed:
//   basemap            Esri satellite raster, OSM fallback
//   NASA atlas         the selected frame (HLS, snow, precipitation, radiance, lights) as an overlay,
//                      its observation-limits mask, and EONET events
//   Maxar before/after two high-res tile sets, compared with the opacity slider (a crossfade:
//                      MapLibre has no Leaflet pane clip, so the side-by-side split is gone)
//   HOT/OSM buildings  the building reference outlines with a review popup (zoom 15+)
//   NASA zones         the role-4 evidence cells as a GeoJSON fill layer
//   records            the desk's own records, as pins
// The controls, panel and legend are pure React overlays (NasaAtlasControls, NasaEvidence).
// Browser only: MapScreen loads this with next/dynamic.
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapGL, { Layer, Marker, NavigationControl, Popup, Source, type MapRef } from "react-map-gl/maplibre";
import type { LatLng } from "@/lib/types";
import { cn } from "@/lib/utils";
import { markerSize, tierBar } from "../../encode";
import { loadReviews, REVIEW_STATUSES, saveReview } from "../buildingReview";
import { baseStyle } from "../basemaps";
import BasemapFallback from "./BasemapFallback";
import { tokenColor } from "./tokens";
import type { MapItem } from "../mapItems";
import { NasaEvidence } from "../NasaEvidence";
import { NasaAtlasControls, useNasaAtlas, type AtlasSelection, type NasaAtlas } from "../NasaAtlas";
import { useZones, type ZoneFC } from "../ZoneLayer";

// An "image" source takes the four corners, top-left going clockwise.
function corners([[s, w], [n, e]]: [LatLng, LatLng]): [[number, number], [number, number], [number, number], [number, number]] {
  return [[w, n], [e, n], [e, s], [w, s]];
}
// A raster tile source takes [west, south, east, north].
function bounds([[s, w], [n, e]]: [LatLng, LatLng]): [number, number, number, number] {
  return [w, s, e, n];
}

const DEFAULT_SELECTION: AtlasSelection = { frameId: "maxar-after-2023-02-11", showLimits: false, eventScope: "off", showDemoCells: false, compare: true, split: 50, showBuildings: false };

const placedOf = (items: MapItem[]) => items.filter((i) => i.coords);

export function EvidenceGlMap({ items, onPick, focus }: {
  items: MapItem[]; onPick?: (key: string | null) => void; focus?: string | null;
}) {
  const atlas = useNasaAtlas();
  const zones = useZones("/data/zones.geojson");
  const [selection, setSelection] = useState<AtlasSelection>(DEFAULT_SELECTION);
  const map = useRef<MapRef>(null);
  const [loads, setLoads] = useState(0);
  const ready = loads > 0;

  const pts = useMemo(() => placedOf(items), [items]);
  const frame = atlas?.frames.find((f) => f.id === selection.frameId);
  const highres = useMemo<NonNullable<NasaAtlas["frames"]>>(() => {
    if (!atlas || !frame?.tileURL) return [];
    return selection.compare ? atlas.frames.filter((f) => f.tileURL) : [frame];
  }, [atlas, selection.compare, frame]);
  const hlsBefore = atlas?.frames.find((f) => f.id === "hls-before-2023-02-01");
  const events = useMemo(() => {
    if (!atlas || selection.eventScope === "off") return [];
    return atlas.events.filter((e) => selection.eventScope === "global" || e.regional);
  }, [atlas, selection.eventScope]);

  // The first view: the focused record, else the Maxar after-frame footprint.
  useEffect(() => {
    if (!ready || !atlas) return;
    const focusAt = focus ? pts.find((i) => i.key === focus)?.coords : undefined;
    if (focusAt) map.current?.flyTo({ center: [focusAt[1], focusAt[0]], zoom: 16 });
    else {
      const b = atlas.frames.find((f) => f.id === DEFAULT_SELECTION.frameId)?.bounds;
      if (b) map.current?.fitBounds(bounds(b), { padding: 30, maxZoom: 16 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, atlas]);

  // A control asked to fly somewhere (a building, the city, an event): store it as a target.
  const [target, setTarget] = useState<{ coords: LatLng; zoom: number } | null>(null);
  useEffect(() => {
    if (!ready || !target) return;
    map.current?.flyTo({ center: [target.coords[1], target.coords[0]], zoom: target.zoom, duration: 800 });
  }, [ready, target]);

  const [building, setBuilding] = useState<{ ref: string; lngLat: LatLng } | null>(null);
  const [reviewValue, setReviewValue] = useState("");
  useEffect(() => { setReviewValue(building ? loadReviews()[building.ref]?.status ?? "" : ""); }, [building]);

  const pickRecord = useCallback((key: string | null) => onPick?.(key), [onPick]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <MapGL
        ref={map}
        initialViewState={{ longitude: 36.19, latitude: 36.19, zoom: 13 }}
        mapStyle={baseStyle(false, true)}
        onLoad={() => setLoads((n) => n + 1)}
        onClick={(e) => {
          if (!(e.originalEvent.target as HTMLElement).closest("button, select, a, input, summary, details")) pickRecord(null);
          if (!selection.showBuildings || !map.current) return;
          const feats = map.current.getMap().queryRenderedFeatures(e.point, { layers: ["buildings-ref-fill"] });
          if (feats.length) {
            const p = feats[0].properties as { referenceId: string };
            setBuilding({ ref: p.referenceId, lngLat: [e.lngLat.lat, e.lngLat.lng] });
          } else setBuilding(null);
        }}
        attributionControl={{ compact: true }}
        maxPitch={0}
        style={{ width: "100%", height: "100%" }}
      >
        <BasemapFallback />
        <NavigationControl position="bottom-right" visualizePitch={false} />

        {/* NASA frame, as a single image pinned to its bounds. */}
        {frame && !frame.tileURL && (
          <Source id="nasa-frame" type="image" url={frame.image} coordinates={corners(frame.bounds)}>
            <Layer id="nasa-frame" type="raster" paint={{ "raster-opacity": frame.kind.startsWith("hls") ? 1 : 0.75 }} />
          </Source>
        )}

        {/* Maxar before/after high-res tiles. After sits on top; the slider fades it over the before. */}
        {highres.length > 0 && (
          <>
            {highres.map((f) => (
              <Source key={f.id} id={`hr-${f.id}`} type="raster" tiles={[f.tileURL!]} tileSize={256}
                minzoom={11} maxzoom={18} bounds={bounds(f.bounds)} attribution="Imagery © Maxar Open Data, CC BY-NC 4.0">
                <Layer id={`hr-${f.id}`} type="raster"
                  paint={{ "raster-opacity": selection.compare && f.kind === "highres-after" ? (selection.split ?? 50) / 100 : 1 }} />
              </Source>
            ))}
            {hlsBefore && highres.some((f) => f.kind === "highres-before") && (
              <Source id="hr-hls-before" type="image" url={hlsBefore.image} coordinates={corners(hlsBefore.bounds)}>
                <Layer id="hr-hls-before" type="raster" />
              </Source>
            )}
          </>
        )}

        {/* Observation-limits mask, purple where the product is unreliable. */}
        {frame && selection.showLimits && frame.limitation && (
          <Source id="nasa-limits" type="image" url={frame.limitsImage} coordinates={corners(frame.bounds)}>
            <Layer id="nasa-limits" type="raster" paint={{ "raster-opacity": 0.85 }} />
          </Source>
        )}

        {/* Night-light change pairs, as lines over their cells. */}
        {frame?.kind === "radiance-change" && <RadianceLines />}

        {/* HOT/OSM building references, click to review (zoom 15+). */}
        {selection.showBuildings && highres.length > 0 && <BuildingRefs />}

        {/* NASA zones (demo cells). */}
        {zones && selection.showDemoCells && <ZonesOnMap fc={zones} />}

        {/* EONET events, as rings. */}
        {events.map((event) => (
          <Marker key={event.id} longitude={event.coords[1]} latitude={event.coords[0]} anchor="center">
            <span title={event.title} className="block size-3.5 rounded-full border-2 border-primary bg-background/70" />
          </Marker>
        ))}

        {/* The desk's records. */}
        {pts.map((it) => (
          <Marker key={it.key} longitude={it.coords![1]} latitude={it.coords![0]} anchor="center"
            style={{ zIndex: it.key === focus ? 30 : it.actNow ? 20 : 10 }}>
            <button type="button" onClick={() => pickRecord(it.key === focus ? null : it.key)} aria-label={it.title}
              title={it.title}
              className={cn("relative block rounded-full border-2 border-background shadow-md", tierBar(it.tier, it.actNow), it.actNow && "marker-pulse", it.key === focus && "ring-2 ring-primary")}
              style={{ width: markerSize(it.support), height: markerSize(it.support) }} />
          </Marker>
        ))}

        {/* Building review popup. */}
        {building && selection.showBuildings && (
          <Popup longitude={building.lngLat[1]} latitude={building.lngLat[0]} anchor="bottom" offset={18}
            closeButton={false} closeOnClick={false} maxWidth="none" onClose={() => setBuilding(null)}>
            <div className="w-72 rounded-lg border bg-card p-3 text-sm shadow-lg">
              <p className="font-semibold">Mapped destroyed building · {building.ref}</p>
              <p className="mt-1 text-xs text-muted-foreground">HOT / OpenStreetMap · 6 Feb 2023 · historical mapping · human review required.</p>
              <label className="mt-2 block text-xs" htmlFor="building-review-status">Your local review</label>
              <select id="building-review-status" className="mt-1 w-full rounded-md border bg-background p-1.5 text-sm"
                value={reviewValue} onChange={(e) => { setReviewValue(e.target.value); saveReview(building.ref, e.target.value); }}>
                {REVIEW_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <p className="mt-2 text-xs text-muted-foreground">Saved in this browser. Export from the imagery controls to share.</p>
            </div>
          </Popup>
        )}
      </MapGL>

      {/* The evidence panel and its layer controls, top-right (only once the zones have loaded). */}
      {atlas && zones && (
        <NasaEvidence fc={zones}>
          <NasaAtlasControls
            atlas={atlas}
            selection={selection}
            onChange={setSelection}
            onLocate={(coords) => setTarget({ coords, zoom: 17 })}
            onCityView={() => setTarget({ coords: atlasCity(atlas), zoom: 13 })}
          />
        </NasaEvidence>
      )}
    </div>
  );
}

// The atlas bounding box centre, for "Fit city".
function atlasCity(atlas: NasaAtlas): LatLng {
  const [s, w, n, e] = atlas.bbox;
  return [(s + n) / 2, (w + e) / 2];
}

function RadianceLines() {
  const [data, setData] = useState<GeoJSON.FeatureCollection | null>(null);
  useEffect(() => {
    const ctl = new AbortController();
    fetch("/data/nasa-atlas/radiance-pairs.geojson", { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null)).then(setData).catch(() => {});
    return () => ctl.abort();
  }, []);
  if (!data) return null;
  return (
    <Source id="radiance-pairs" type="geojson" data={data}>
      <Layer id="radiance-pairs" type="line" paint={{ "line-color": tokenColor("muted-foreground"), "line-width": 0.5 }} />
    </Source>
  );
}

function BuildingRefs() {
  const [data, setData] = useState<GeoJSON.FeatureCollection | null>(null);
  useEffect(() => {
    const ctl = new AbortController();
    fetch("/data/antakya/buildings.geojson", { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null)).then(setData).catch(() => {});
    return () => ctl.abort();
  }, []);
  if (!data) return null;
  return (
    <Source id="buildings-ref" type="geojson" data={data} attribution="© OpenStreetMap contributors / HOT, ODbL 1.0">
      <Layer id="buildings-ref-fill" type="fill" minzoom={15} paint={{ "fill-color": tokenColor("primary"), "fill-opacity": 0.12 }} />
      <Layer id="buildings-ref-line" type="line" minzoom={15} paint={{ "line-color": tokenColor("primary"), "line-width": 1.5 }} />
    </Source>
  );
}

function ZonesOnMap({ fc }: { fc: ZoneFC }) {
  const unknown = fc.features.some((f) => (f.properties as { silentZone?: boolean | null }).silentZone === null);
  return (
    <Source id="nasa-zones" type="geojson" data={fc}>
      <Layer id="nasa-zones-fill" type="fill" paint={{
        "fill-color": ["case",
          ["==", ["get", "silentZone"], true], tokenColor("primary"),
          ["==", ["get", "cold"], true], tokenColor("info"),
          tokenColor("muted-foreground")],
        "fill-opacity": 0.25,
      }} />
      <Layer id="nasa-zones-line" type="line" paint={{ "line-color": tokenColor("muted-foreground"), "line-width": 1.5, "line-dasharray": unknown ? [2, 2] : [1] }} />
    </Source>
  );
}
