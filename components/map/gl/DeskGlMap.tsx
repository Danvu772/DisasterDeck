"use client";
// The desk's map, on MapLibre GL: vector basemap (CARTO Positron / Dark Matter, follows the theme)
// or satellite, smooth zoom and tilt. On top, in this order:
//   destroyed buildings  OSM / HOT reference polygons, a heat glow when zoomed out, 3D blocks up close
//   quakes               USGS events, ring size by magnitude
//   records              sites, field problems, shelters, closed roads, as HTML markers
//   hazards              a site with a hazard (fire, gas, a wall falling) glows warm
// Clicking a marker selects it and opens a small card in plain words. No ids, no coordinates.
// Browser only: load with next/dynamic, ssr off.
import "maplibre-gl/dist/maplibre-gl.css";
import { AnimatePresence, motion } from "motion/react";
import { Building2, Layers, Map as MapIcon, Satellite, Users, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import MapGL, {
  Layer, Marker, NavigationControl, Popup, ScaleControl, Source, type MapRef,
} from "react-map-gl/maplibre";
import type { StyleSpecification } from "maplibre-gl";
import type { Incident, LatLng, Road, Shelter, Site } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ageText, isStale, markerSize, tierText } from "../../encode";
import { useIsDark } from "../../theme/theme";
import type { MapItem } from "../mapItems";
import { tokenColor } from "./tokens";
import { KCollapse, KCone, KDanger, KFire, KQuake, KRoadblock, KTent } from "../../icons/koboyo";
import { HAZARD_LEGEND, hazardType, INCIDENT_ICON } from "../../icons/things";

export interface GlQuake { id: string; lat: number; lon: number; mag: number; time: string; place?: string }

export interface GlLayers { records: boolean; hazards: boolean; buildings: boolean; quakes: boolean; tilt: boolean }
const DEFAULT_LAYERS: GlLayers = { records: true, hazards: true, buildings: true, quakes: true, tilt: false };

const CARTO = {
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
};
const SATELLITE: StyleSpecification = {
  version: 8,
  glyphs: "https://basemaps.cartocdn.com/fonts/{fontstack}/{range}.pbf",
  sources: {
    esri: {
      type: "raster", tileSize: 256, maxzoom: 19,
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
    },
  },
  layers: [{ id: "esri", type: "raster", source: "esri" }],
};

const ANTAKYA = { longitude: 36.162, latitude: 36.205, zoom: 13 };
const ll = (c: LatLng): [number, number] => [c[1], c[0]];

const BUILDINGS_URL = "/data/antakya/buildings.geojson";
type FC = GeoJSON.FeatureCollection;

function useBuildings(on: boolean) {
  const [data, setData] = useState<{ shapes: FC; points: FC } | null>(null);
  useEffect(() => {
    if (!on || data) return;
    const ctl = new AbortController();
    fetch(BUILDINGS_URL, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((shapes: FC | null) => {
        if (!shapes) return;
        // Heat needs points: one per building, at the middle of its outline.
        const points: FC = {
          type: "FeatureCollection",
          features: shapes.features.flatMap((f) => {
            if (f.geometry.type !== "Polygon") return [];
            const ring = f.geometry.coordinates[0];
            const x = ring.reduce((s, p) => s + p[0], 0) / ring.length;
            const y = ring.reduce((s, p) => s + p[1], 0) / ring.length;
            return [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [x, y] } }];
          }),
        };
        setData({ shapes, points });
      })
      .catch(() => {});
    return () => ctl.abort();
  }, [on, data]);
  return data;
}

/** Colours for paint, re-read when the theme flips. */
function usePalette(dark: boolean) {
  return useMemo(() => ({
    act: tokenColor("destructive"),
    actSoft: tokenColor("destructive", 0),
    warn: tokenColor("warning"),
    fg: tokenColor("foreground"),
    bg: tokenColor("background"),
    muted: tokenColor("muted-foreground"),
    info: tokenColor("info"),
    dark,
  }), [dark]);
}

const hazardOf = (it: MapItem) => (it.kind === "site" ? (it.record as Site).hazard : undefined);

// ---------- markers ----------

function RecordMarker({ it, selected, now, ringing, onClick }: {
  it: MapItem; selected: boolean; now: number; ringing: boolean; onClick: () => void;
}) {
  const stale = isStale(it.staleType, it.at, now);
  const sel = selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background scale-110" : "";
  const tone = it.actNow || it.tier === 0 ? "bg-destructive text-destructive-foreground"
    : it.tier === 1 ? "bg-warning text-warning-foreground" : "bg-calm text-primary-foreground";

  if (it.kind === "road") {
    const closed = it.status === "closed";
    return (
      <button type="button" onClick={onClick} aria-label={`Road: ${it.title}`}
        className={cn("flex h-6 items-center gap-1 rounded-full border-2 bg-background px-1.5 text-foreground shadow-sm transition-transform",
          closed ? "border-foreground" : "border-dashed border-muted-foreground", sel, stale && "opacity-75 saturate-50")}>
        {closed ? <KRoadblock className="size-4" /> : <KCone className="size-3.5" />}
      </button>
    );
  }
  if (it.kind === "shelter") {
    return (
      <button type="button" onClick={onClick} aria-label={`Shelter: ${it.title}`}
        className={cn("flex size-7 items-center justify-center rounded-lg border-2 border-background shadow-md transition-transform",
          it.tier === 1 ? "bg-warning text-warning-foreground" : "bg-success text-primary-foreground", sel, stale && "opacity-75 saturate-50")}>
        <KTent className="size-4" />
      </button>
    );
  }
  if (it.kind === "incident") {
    const Icon = INCIDENT_ICON[(it.record as Incident).kind] ?? KDanger;
    return (
      <button type="button" onClick={onClick} aria-label={`Problem: ${it.title}`}
        className={cn("flex size-7 items-center justify-center rounded-md border-2 border-background shadow-md transition-transform", tone, sel, stale && "opacity-75 saturate-50")}>
        <Icon className="size-4" />
      </button>
    );
  }
  // site: a danger shows its own icon (fire, gas, live wires …) with the trapped count on a corner badge;
  // without one, the marker is just the number of people trapped.
  const hz = hazardType(hazardOf(it));
  const trapped = (it.record as Site).peopleTrapped;
  const s = Math.max(hz ? 30 : 22, markerSize(it.support) + 6);
  return (
    <button type="button" onClick={onClick} aria-label={`Site: ${it.title}${hz ? `, ${hz.word.toLowerCase()}` : ""}${trapped > 0 ? `, ${trapped} trapped` : ""}`}
      className={cn("relative isolate flex items-center justify-center rounded-full border-2 border-background font-mono text-[11px] font-semibold shadow-md transition-transform",
        tone, sel, stale && "opacity-75 saturate-50", it.actNow && !stale && "marker-pulse", hz && "marker-glow", ringing && "map-ring")}
      style={{ width: s, height: s }}>
      {hz ? <hz.icon className="size-[55%]" /> : trapped > 0 ? trapped : null}
      {hz && trapped > 0 && (
        <span aria-hidden className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-destructive bg-background px-1 text-[10px] leading-none text-foreground">
          {trapped}
        </span>
      )}
    </button>
  );
}

// ---------- the selected record, in words ----------

function Fact({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <p className="flex items-center gap-2 text-xs text-muted-foreground [&_svg]:size-3.5">{icon}<span className="text-foreground">{children}</span></p>;
}

function RecordCard({ it, now, onClose }: { it: MapItem; now: number; onClose: () => void }) {
  const tier = tierText(it.tier);
  const badge = it.actNow || it.tier === 0 ? "bg-destructive text-destructive-foreground"
    : it.tier === 1 ? "bg-warning text-warning-foreground" : "bg-secondary text-secondary-foreground";
  let kind = "Rescue site", body: ReactNode = null, title = it.title;
  if (it.kind === "site") {
    const s = it.record as Site;
    body = (
      <>
        <Fact icon={<Users />}>{s.peopleTrapped > 0 ? `${s.peopleTrapped} ${s.peopleTrapped === 1 ? "person" : "people"} trapped` : "No one reported trapped"}</Fact>
        {s.hazard && (() => { const h = hazardType(s.hazard)!; return <Fact icon={<h.icon />}>{s.hazard}</Fact>; })()}
        <Fact icon={<Building2 />}>{s.status === "team_on_site" ? "A team is on site" : s.status === "open" ? "Waiting for a team" : s.status === "closed" ? "Done" : "Withdrawn"}</Fact>
      </>
    );
  } else if (it.kind === "incident") {
    const i = it.record as Incident;
    kind = "Problem in the field";
    title = i.kind.replaceAll("_", " ");
    body = (
      <>
        {(i.textEn || i.text) && <p className="text-xs text-foreground">“{i.textEn || i.text}”</p>}
        <Fact icon={<KDanger />}>{i.canContinue ? "The team can carry on" : "The team is stopped"}</Fact>
      </>
    );
  } else if (it.kind === "shelter") {
    const h = it.record as Shelter;
    kind = "Shelter";
    title = h.name;
    const free = Math.max(0, h.bedsTotal - h.bedsUsed);
    body = (
      <>
        <div className="flex items-baseline gap-1.5"><span className="font-mono text-2xl font-semibold">{free}</span><span className="text-xs text-muted-foreground">beds free of {h.bedsTotal}</span></div>
        <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
          <div className={cn("h-full rounded-full", it.tier === 1 ? "bg-warning" : "bg-success")} style={{ width: `${Math.min(100, (h.bedsUsed / Math.max(1, h.bedsTotal)) * 100)}%` }} />
        </div>
      </>
    );
  } else if (it.kind === "road") {
    const r = it.record as Road;
    kind = r.state === "closed" ? "Road closed" : "Road, not confirmed";
    title = r.road;
    body = r.reason ? <p className="text-xs text-foreground">{r.reason}</p> : null;
  }
  const reporters = it.sources && it.sources > 1 ? `${it.sources} reports` : it.kind === "site" ? "1 report" : "";
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 32 }}
      className="w-64 rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg"
    >
      <div className="mb-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-muted-foreground">{kind}</p>
          <p className="truncate text-sm font-semibold first-letter:uppercase">{title}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 -mt-1 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>
      {it.kind !== "shelter" && it.kind !== "road" && (
        <span className={cn("mb-2 inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-medium", badge)}>{tier.word}</span>
      )}
      <div className="space-y-1.5">{body}</div>
      <p className="mt-2 border-t pt-2 text-[11px] text-muted-foreground">
        {[reporters, it.confidence === "confirmed" ? "Confirmed" : it.confidence === "corroborated" ? "Backed up" : "Not confirmed yet", ageText(it.at, now)].filter(Boolean).join(" · ")}
      </p>
    </motion.div>
  );
}

// ---------- layer switcher + legend ----------

function LayerPanel({ layers, setLayers, sat, setSat, counts }: {
  layers: GlLayers; setLayers: (l: GlLayers) => void; sat: boolean; setSat: (v: boolean) => void;
  counts: { hazards: number; quakes: number; buildings: number };
}) {
  const [open, setOpen] = useState(false);
  const row = (key: keyof GlLayers, label: string, icon: ReactNode, n?: number) => (
    <button key={key} type="button" aria-pressed={layers[key]} onClick={() => setLayers({ ...layers, [key]: !layers[key] })}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent [&_svg]:size-3.5">
      <span className={cn("flex size-4 items-center justify-center rounded-sm border", layers[key] && "border-primary bg-primary text-primary-foreground")}>
        {layers[key] && <span className="size-1.5 rounded-full bg-primary-foreground" />}
      </span>
      {icon}<span className="flex-1">{label}</span>
      {n !== undefined && <span className="font-mono text-muted-foreground">{n}</span>}
    </button>
  );
  return (
    <div className="pointer-events-auto absolute top-3 left-3 z-10 flex flex-col items-start gap-2">
      <div className="flex rounded-lg border bg-background/90 p-0.5 shadow-sm backdrop-blur">
        {[{ v: false, label: "Map", icon: <MapIcon /> }, { v: true, label: "Satellite", icon: <Satellite /> }].map((o) => (
          <button key={o.label} type="button" aria-pressed={sat === o.v} onClick={() => setSat(o.v)}
            className={cn("flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors [&_svg]:size-3.5",
              sat === o.v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
            {o.icon}{o.label}
          </button>
        ))}
        <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} aria-label="Layers"
          className={cn("ml-0.5 flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium [&_svg]:size-3.5",
            open ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}>
          <Layers />Layers
        </button>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            className="w-56 rounded-xl border bg-background/95 p-1.5 shadow-lg backdrop-blur">
            {row("records", "Reports from the desk", <Users />)}
            {row("hazards", "Fires and hazards", <KFire />, counts.hazards)}
            {row("buildings", "Destroyed buildings", <KCollapse />, counts.buildings || undefined)}
            {row("quakes", "Earthquakes (USGS)", <KQuake />, counts.quakes || undefined)}
            {row("tilt", "3D view", <Layers />)}
            <div className="mt-1 space-y-1 border-t px-2 pt-2 pb-1 text-[11px] text-muted-foreground">
              <p className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-destructive" />Life-threatening</p>
              <p className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-warning" />Urgent</p>
              <p className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-calm" />Can wait</p>
              <p className="flex items-center gap-2"><span className="size-2.5 rounded-sm bg-success" />Shelter with room</p>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 border-t pt-1.5 [&_svg]:size-3.5 [&_svg]:text-foreground">
                {HAZARD_LEGEND.map(({ word, icon: Icon }) => <p key={word} className="flex items-center gap-1.5"><Icon />{word}</p>)}
                <p className="flex items-center gap-1.5"><KTent />Shelter</p>
                <p className="flex items-center gap-1.5"><KRoadblock />Road closed</p>
                <p className="flex items-center gap-1.5"><KCone />Road unsure</p>
              </div>
              <p>Number = people trapped. Faded = not updated lately.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------- the map ----------

export default function DeskGlMap({
  items, now, selected, onPick, flyKey, ringAt, quakes = [], ringKeys, initialLayers, className, controls = true, popup = true, children,
}: {
  items: MapItem[];
  now: number;
  selected?: string | null;
  onPick?: (key: string | null) => void;
  flyKey?: string;                 // fly to this record when it changes
  ringAt?: LatLng;                 // selection without a marker (an open road): a ring there
  quakes?: GlQuake[];
  ringKeys?: Set<string>;          // new criticals: one ring
  initialLayers?: Partial<GlLayers>;
  className?: string;
  controls?: boolean;
  popup?: boolean;                 // the small card on the selected marker (off where a side panel shows it)
  children?: ReactNode;            // overlays on top of the map
}) {
  const dark = useIsDark();
  const paint = usePalette(dark);
  const map = useRef<MapRef>(null);
  const [sat, setSat] = useState(false);
  const [layers, setLayers] = useState<GlLayers>({ ...DEFAULT_LAYERS, ...initialLayers });
  // Counts map loads, not just "loaded once": in dev StrictMode the map is made twice, and the
  // effects below must run again for the second, real one.
  const [loads, setLoads] = useState(0);
  const ready = loads > 0;
  const buildings = useBuildings(layers.buildings);

  const placed = useMemo(() => items.filter((i) => i.coords), [items]);
  const hazards = placed.filter((i) => hazardOf(i));
  const shown = placed.filter((i) => (hazardOf(i) ? layers.hazards || layers.records : layers.records));
  const sel = placed.find((i) => i.key === selected);

  // First view: all records, set when the map is made (no load event needed). After that, a glide
  // to the new extent whenever the records move somewhere else (the fixtures give way to the live
  // desk), until the person moves the map themselves.
  const userMoved = useRef(false);
  const lng = placed.map((i) => i.coords![1]), lat = placed.map((i) => i.coords![0]);
  const box = placed.length ? [Math.min(...lng), Math.min(...lat), Math.max(...lng), Math.max(...lat)].map((v) => v.toFixed(2)).join(",") : "";
  const lastBox = useRef(box);
  const [firstView] = useState(() => {
    if (!box) return ANTAKYA;
    const [w, s, e, n] = box.split(",").map(Number);
    if (w === e && s === n) return { longitude: w, latitude: s, zoom: 15 };
    return { bounds: [[w, s], [e, n]] as [[number, number], [number, number]], fitBoundsOptions: { padding: 70, maxZoom: 15.5 } };
  });
  useEffect(() => {
    if (!ready || !box || userMoved.current || box === lastBox.current) return;
    lastBox.current = box;
    const [w, s, e, n] = box.split(",").map(Number);
    if (w === e && s === n) map.current?.flyTo({ center: [w, s], zoom: 15, duration: 600 });
    else map.current?.fitBounds([[w, s], [e, n]], { padding: 70, maxZoom: 15.5, duration: 600 });
  }, [ready, loads, box]);

  // Fly to a record the list picked.
  const flyTo = flyKey ? placed.find((i) => i.key === flyKey)?.coords : undefined;
  const flyLat = flyTo?.[0], flyLng = flyTo?.[1];
  useEffect(() => {
    if (!ready || flyLat === undefined || flyLng === undefined) return;
    const m = map.current;
    userMoved.current = true;          // a picked record keeps the view; no refit after this
    m?.flyTo({ center: [flyLng, flyLat], zoom: Math.max(m.getZoom(), 15.5), duration: 900, essential: true });
  }, [ready, loads, flyKey, flyLat, flyLng]);

  // 3D: tilt and turn a little; flat again when off.
  useEffect(() => {
    if (!ready) return;
    map.current?.easeTo({ pitch: layers.tilt ? 55 : 0, bearing: layers.tilt ? -18 : 0, duration: 800 });
  }, [ready, loads, layers.tilt]);

  const quakeFC = useMemo<FC>(() => ({
    type: "FeatureCollection",
    features: quakes.map((q) => ({ type: "Feature", properties: { mag: q.mag, label: `M${q.mag.toFixed(1)}` }, geometry: { type: "Point", coordinates: [q.lon, q.lat] } })),
  }), [quakes]);

  const links = useMemo<FC>(() => ({
    type: "FeatureCollection",
    features: placed.filter((i) => i.linkTo).map((i) => ({
      type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [ll(i.coords!), ll(i.linkTo!)] },
    })),
  }), [placed]);

  const pick = useCallback((key: string | null) => onPick?.(key), [onPick]);
  const style = sat ? SATELLITE : dark ? CARTO.dark : CARTO.light;

  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)}>
      <MapGL
        ref={map}
        initialViewState={firstView}
        mapStyle={style}
        onLoad={() => setLoads((n) => n + 1)}
        onMoveStart={(e) => { if (e.originalEvent) userMoved.current = true; }}
        onClick={(e) => { if (!(e.originalEvent.target as HTMLElement).closest("button")) pick(null); }}
        maxPitch={70}
        attributionControl={{ compact: true }}
        style={{ width: "100%", height: "100%" }}
      >
        <NavigationControl position="bottom-right" visualizePitch />
        <ScaleControl position="bottom-left" />

        {layers.buildings && buildings && (
          <>
            <Source id="destroyed-heat" type="geojson" data={buildings.points}>
              <Layer id="destroyed-heat" type="heatmap" maxzoom={16} paint={{
                "heatmap-weight": 1,
                "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 10, 0.4, 15, 0.9],
                "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 10, 4, 13, 10, 15, 16],
                "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 12, 0.55, 15, 0.25, 16, 0],
                "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"],
                  0, paint.actSoft, 0.2, tokenColor("warning", 0.25), 0.5, tokenColor("warning", 0.55), 0.85, tokenColor("destructive", 0.7), 1, paint.act],
              }} />
            </Source>
            <Source id="destroyed" type="geojson" data={buildings.shapes}>
              <Layer id="destroyed-3d" type="fill-extrusion" minzoom={14} paint={{
                "fill-extrusion-color": paint.act,
                "fill-extrusion-height": layers.tilt ? 14 : 0.5,
                "fill-extrusion-base": 0,
                "fill-extrusion-opacity": 0.75,
              }} />
            </Source>
          </>
        )}

        {layers.quakes && quakes.length > 0 && (
          <Source id="quakes" type="geojson" data={quakeFC}>
            <Layer id="quake-halo" type="circle" paint={{
              "circle-radius": ["interpolate", ["exponential", 1.6], ["get", "mag"], 4, 6, 6, 18, 7.8, 46],
              "circle-color": tokenColor("warning", 0.12),
              "circle-stroke-color": paint.warn,
              "circle-stroke-width": 1.5,
              "circle-stroke-opacity": 0.8,
            }} />
            <Layer id="quake-label" type="symbol" minzoom={7} filter={[">=", ["get", "mag"], 5.5]} layout={{
              "text-field": ["get", "label"], "text-size": 11, "text-font": ["Open Sans Semibold"], "text-offset": [0, 0],
            }} paint={{ "text-color": paint.fg, "text-halo-color": paint.bg, "text-halo-width": 1.5 }} />
          </Source>
        )}

        {layers.records && links.features.length > 0 && (
          <Source id="links" type="geojson" data={links}>
            <Layer id="links" type="line" paint={{ "line-color": paint.muted, "line-width": 1.5, "line-dasharray": [2, 3] }} />
          </Source>
        )}

        {shown.map((it) => (
          <Marker key={it.key} longitude={it.coords![1]} latitude={it.coords![0]} anchor="center"
            style={{ zIndex: it.key === selected ? 30 : it.actNow ? 20 : it.kind === "incident" ? 15 : 10 }}>
            <RecordMarker it={it} selected={it.key === selected} now={now} ringing={!!ringKeys?.has(it.key)}
              onClick={() => pick(it.key === selected ? null : it.key)} />
          </Marker>
        ))}

        {ringAt && !sel && (
          <Marker longitude={ringAt[1]} latitude={ringAt[0]} anchor="center">
            <span className="block size-5 rounded-full border-2 border-primary bg-background/60 ring-4 ring-primary/30" />
          </Marker>
        )}

        {popup && sel && (
          <Popup longitude={sel.coords![1]} latitude={sel.coords![0]} anchor="bottom" offset={22}
            closeButton={false} closeOnClick={false} maxWidth="none" onClose={() => pick(null)}>
            <RecordCard it={sel} now={now} onClose={() => pick(null)} />
          </Popup>
        )}
      </MapGL>

      {controls && (
        <LayerPanel layers={layers} setLayers={setLayers} sat={sat} setSat={setSat}
          counts={{ hazards: hazards.length, quakes: quakes.length, buildings: buildings?.shapes.features.length ?? 0 }} />
      )}
      {children}
    </div>
  );
}
