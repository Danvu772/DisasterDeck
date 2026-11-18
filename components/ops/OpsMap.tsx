"use client";
// The /ops map: what the stream built so far (sites, needs, roads, shelters) and the real USGS
// aftershocks up to the scenario time, on the desk's MapLibre basemap (same look as /map).
// Hover a pin for its one-line label. Browser only: OpsRoom loads this with next/dynamic.
import "maplibre-gl/dist/maplibre-gl.css";
import { useMemo } from "react";
import MapGL, { Layer, Marker, NavigationControl, Source } from "react-map-gl/maplibre";
import { pilotCenter } from "@/lib/pilot";
import { cn } from "@/lib/utils";
import { markerSize } from "../encode";
import { baseStyle } from "../map/basemaps";
import BasemapFallback from "../map/gl/BasemapFallback";
import { tokenColor } from "../map/gl/tokens";
import { useIsDark } from "../theme/theme";
import { KCone, KPackage, KRoadblock, KTent } from "../icons/koboyo";
import type { OpsPin, Quake } from "./opsModel";

function Pin({ p, fresh }: { p: OpsPin; fresh: boolean }) {
  const tone = p.closed ? "bg-calm text-primary-foreground" : p.actNow || p.tier === 0 ? "bg-destructive text-destructive-foreground"
    : p.tier === 1 ? "bg-warning text-warning-foreground" : "bg-calm text-primary-foreground";
  if (p.kind === "road") {
    return (
      <span title={p.label} className={cn("flex h-5 items-center rounded-full border-2 bg-background px-1 text-foreground shadow-sm",
        p.label.startsWith("Road closed") ? "border-foreground" : "border-dashed border-muted-foreground", fresh && "map-ring")}>
        {p.label.startsWith("Road closed") ? <KRoadblock className="size-3.5" /> : <KCone className="size-3" />}
      </span>
    );
  }
  if (p.kind === "site") {
    const s = markerSize(p.support) + 2;
    return (
      <span title={p.label} style={{ width: s, height: s }}
        className={cn("relative isolate block rounded-full border-2 border-background shadow-md", tone,
          p.actNow && !p.closed && "marker-pulse", p.closed && "opacity-60", fresh && "map-ring")} />
    );
  }
  const Icon = p.kind === "shelter" ? KTent : KPackage;
  return (
    <span title={p.label} className={cn("flex size-5 items-center justify-center rounded-md border-2 border-background shadow-sm", tone, fresh && "map-ring")}>
      <Icon className="size-3" />
    </span>
  );
}

export default function OpsMap({ pins, quakes, freshKey }: { pins: OpsPin[]; quakes: Quake[]; freshKey?: string }) {
  const dark = useIsDark();
  const warn = useMemo(() => ({ line: tokenColor("warning"), fill: tokenColor("warning", 0.12), fg: tokenColor("foreground"), bg: tokenColor("background") }),
    // the colours depend on the theme
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dark]);

  const quakeFC = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    features: quakes.map((q) => ({ type: "Feature", properties: { mag: q.mag, label: `M${q.mag.toFixed(1)}` }, geometry: { type: "Point", coordinates: [q.lon, q.lat] } })),
  }), [quakes]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <MapGL initialViewState={{ longitude: pilotCenter[1], latitude: pilotCenter[0], zoom: 12 }} mapStyle={baseStyle(dark, false)}
        attributionControl={{ compact: true }} style={{ width: "100%", height: "100%" }}>
        <NavigationControl position="bottom-right" showCompass={false} />
        <BasemapFallback />
        {quakes.length > 0 && (
          <Source id="ops-quakes" type="geojson" data={quakeFC}>
            <Layer id="ops-quake-halo" type="circle" paint={{
              "circle-radius": ["interpolate", ["exponential", 1.6], ["get", "mag"], 4.5, 4, 6, 12, 7.8, 34],
              "circle-color": warn.fill, "circle-stroke-color": warn.line, "circle-stroke-width": 1.5,
            }} />
            <Layer id="ops-quake-label" type="symbol" filter={[">=", ["get", "mag"], 5.5]} layout={{
              "text-field": ["get", "label"], "text-size": 11, "text-font": ["Open Sans Semibold"],
            }} paint={{ "text-color": warn.fg, "text-halo-color": warn.bg, "text-halo-width": 1.5 }} />
          </Source>
        )}
        {pins.map((p) => (
          <Marker key={p.key} longitude={p.coords[1]} latitude={p.coords[0]} anchor="center"
            style={{ zIndex: p.actNow ? 20 : p.kind === "road" ? 15 : 10 }}>
            <Pin p={p} fresh={p.key === freshKey} />
          </Marker>
        ))}
      </MapGL>
      <div className="pointer-events-none absolute top-3 left-3 hidden rounded-lg border bg-background/90 px-2.5 py-2 text-[11px] text-muted-foreground shadow-sm backdrop-blur md:block">
        <p className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-destructive" />Trapped people</p>
        <p className="flex items-center gap-2"><KPackage className="size-3 text-foreground" />Need</p>
        <p className="flex items-center gap-2"><KTent className="size-3 text-foreground" />Shelter</p>
        <p className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-calm" />Rescued</p>
        {quakes.length > 0 && <p className="flex items-center gap-2"><span className="size-2.5 rounded-full border-2 border-warning" />USGS earthquake</p>}
      </div>
    </div>
  );
}
