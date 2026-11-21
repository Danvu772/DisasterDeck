"use client";
// The map inside a map answer (MapCard), on MapLibre (D-0006). One motion per answer: the pins
// drop in one after another where the map fits them all, then the map flies to the target and rings
// it once. A click on a pin picks another target and flies there. Reduced motion: the final frame.
// MapLibre needs `window`, so MapCard loads this file in the browser only.
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapGL, { Marker, type MapRef } from "react-map-gl/maplibre";
import { cn } from "@/lib/utils";
import { confidenceBorder, isStale, markerSize, staleInk, tierBar } from "../encode";
import { baseStyle } from "../map/basemaps";
import BasemapFallback from "../map/gl/BasemapFallback";
import type { MapItem } from "../map/mapItems";

const DROP_STEP_MS = 80;     // between two pins
const DROP_MS = 120;         // one pin's drop
const MAX_STAGGER = 12;      // past this many pins, the rest drop with the twelfth
const OPEN_MS = 300;         // the stage grows open first
const TARGET_ZOOM = 16;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const dropDelay = (i: number) => Math.min(i, MAX_STAGGER) * DROP_STEP_MS;

export default function PinMap({ placed, now, target, onPick }: {
  placed: MapItem[]; now: number; target?: string; onPick: (key: string) => void;
}) {
  // The fit uses the pins as they were when the answer arrived. Polls move nothing.
  const [points] = useState(() => placed.map((i) => i.coords!));
  const toKey = placed.find((i) => i.key === target)?.coords;
  const to = useMemo(() => toKey, [toKey]);

  const dropsEnd = dropDelay(placed.length - 1) + DROP_MS;
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), OPEN_MS + dropsEnd);
    return () => clearTimeout(t);
  }, [dropsEnd]);

  const [arrived, setArrived] = useState<string | null>(null);
  const onArrive = useCallback(() => setArrived(target ?? null), [target]);

  const map = useRef<MapRef>(null);
  const [loads, setLoads] = useState(0);
  const ready = loads > 0;
  const fitted = useRef(false);

  // Fit every pin on the first real frame, then fly to the target.
  useEffect(() => {
    if (!ready || fitted.current) return;
    fitted.current = true;
    const m = map.current;
    if (points.length === 1) m?.flyTo({ center: [points[0][1], points[0][0]], zoom: 13, duration: 0 });
    else {
      const lng = points.map((p) => p[1]), lat = points.map((p) => p[0]);
      m?.fitBounds([[Math.min(...lng), Math.min(...lat)], [Math.max(...lng), Math.max(...lat)]], { padding: 40, maxZoom: 15, duration: 0 });
    }
  }, [ready, points]);

  useEffect(() => {
    if (!ready || !to) return;
    const m = map.current;
    if (reducedMotion()) { m?.flyTo({ center: [to[1], to[0]], zoom: TARGET_ZOOM, duration: 0 }); onArrive(); return; }
    const t = setTimeout(() => {
      m?.once("moveend", onArrive);
      m?.flyTo({ center: [to[1], to[0]], zoom: TARGET_ZOOM, duration: 800 });
    }, 0);
    return () => clearTimeout(t);
  }, [ready, to, onArrive]);

  const markerClass = (it: MapItem) => {
    const motion = !settled ? "viz-drop" : it.key === arrived ? "map-ring" : "";
    const fade = staleInk(isStale(it.staleType, it.at, now));
    const ring = it.key === target ? "ring-4 ring-primary" : "";
    return cn("block rounded-full", tierBar(it.tier, it.actNow), confidenceBorder(it.confidence), motion, ring, fade);
  };

  return (
    <div className="h-72 w-full md:h-96">
      <MapGL
        ref={map}
        initialViewState={{ longitude: points[0]?.[1] ?? 0, latitude: points[0]?.[0] ?? 0, zoom: 13 }}
        mapStyle={baseStyle(false, true)}
        onLoad={() => setLoads((n) => n + 1)}
        scrollZoom={false}
        attributionControl={{ compact: true }}
        style={{ width: "100%", height: "100%" }}
      >
        <BasemapFallback />
        {placed.map((it, i) => (
          <Marker key={it.key} longitude={it.coords![1]} latitude={it.coords![0]} anchor="center"
            style={{ zIndex: it.key === target ? 1000 : 0 }}>
            <button type="button" onClick={() => onPick(it.key)} aria-label={it.title} title={it.title}
              className={markerClass(it)}
              style={{ width: markerSize(it.support), height: markerSize(it.support), animationDelay: !settled ? `${OPEN_MS + dropDelay(i)}ms` : undefined }} />
          </Marker>
        ))}
      </MapGL>
    </div>
  );
}
