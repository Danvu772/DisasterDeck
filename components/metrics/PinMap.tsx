"use client";
// The map inside a map answer (MapCard). One motion per answer: the pins drop in one after another
// where the map fits them all, then the map flies to the target and rings it once. A click on a pin
// picks another target and flies there. Reduced motion: the final frame, no flight, no drops.
// Leaflet needs `window`, so MapCard loads this file in the browser only.
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Tooltip, useMap } from "react-leaflet";
import type { LatLng } from "@/lib/types";
import { BasemapTiles } from "../map/basemap";
import { icon } from "../map/markers";
import type { MapItem } from "../map/mapItems";

const DROP_STEP_MS = 80;     // between two pins (t54)
const DROP_MS = 120;         // one pin's drop
const MAX_STAGGER = 12;      // past this many pins, the rest drop with the twelfth
const OPEN_MS = 300;         // the stage grows open first
const TARGET_ZOOM = 16;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const dropDelay = (i: number) => Math.min(i, MAX_STAGGER) * DROP_STEP_MS;
const parse = (k: string) => k.split(",").map(Number) as LatLng;

// Fits every pin once the map has a size (it mounts while the stage is still opening), then flies
// to `to`. The first flight waits for the drops, later ones (a click) go at once.
function Camera({ points, to, firstWaitMs, onArrive }: {
  points: LatLng[]; to?: LatLng; firstWaitMs: number; onArrive: () => void;
}) {
  const map = useMap();
  const fitted = useRef(false);
  const flown = useRef(false);

  useEffect(() => {
    const fit = () => {
      map.invalidateSize();
      const size = map.getSize();
      if (fitted.current || size.x === 0 || size.y === 0) return;
      fitted.current = true;
      if (points.length === 1) map.setView(points[0], 13, { animate: false });
      else map.fitBounds(points, { padding: [40, 40], maxZoom: 15, animate: false });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map, points]);

  useEffect(() => {
    if (!to) return;
    const reduced = reducedMotion();
    const go = () => {
      if (reduced) { map.setView(to, TARGET_ZOOM, { animate: false }); onArrive(); return; }
      map.once("moveend", onArrive);
      map.flyTo(to, TARGET_ZOOM, { duration: 0.8 });
    };
    const t = setTimeout(go, flown.current || reduced ? 0 : firstWaitMs);
    flown.current = true;
    return () => { clearTimeout(t); map.off("moveend", onArrive); };
  }, [map, to, firstWaitMs, onArrive]);

  return null;
}

export default function PinMap({ placed, now, target, onPick }: {
  placed: MapItem[]; now: number; target?: string; onPick: (key: string) => void;
}) {
  // The fit uses the pins as they were when the answer arrived. Polls move nothing.
  const [points] = useState(() => placed.map((i) => i.coords!));
  const toKey = placed.find((i) => i.key === target)?.coords?.join(",");
  const to = useMemo(() => (toKey ? parse(toKey) : undefined), [toKey]);

  const dropsEnd = dropDelay(placed.length - 1) + DROP_MS;
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), OPEN_MS + dropsEnd);
    return () => clearTimeout(t);
  }, [dropsEnd]);

  const [arrived, setArrived] = useState<string | null>(null);
  const onArrive = useCallback(() => setArrived(target ?? null), [target]);

  // Same pin, same html: reuse the icon, so a poll does not rebuild the marker and replay its motion.
  const cache = useRef(new Map<string, L.DivIcon>());
  function iconFor(it: MapItem, i: number): L.DivIcon {
    const motion = !settled ? "viz-drop" : it.key === arrived ? "map-ring" : "";
    const built = icon(it, it.key === target, now, false, motion, !settled ? OPEN_MS + dropDelay(i) : 0);
    const key = `${it.key}|${String(built.options.html)}`;
    const hit = cache.current.get(key);
    if (hit) return hit;
    if (cache.current.size > 500) cache.current.clear();
    cache.current.set(key, built);
    return built;
  }

  return (
    <div className="h-72 w-full md:h-96">
      <MapContainer center={points[0]} zoom={13} scrollWheelZoom={false} className="h-full w-full">
        <BasemapTiles />
        <Camera points={points} to={to} firstWaitMs={OPEN_MS + dropsEnd + 150} onArrive={onArrive} />
        {placed.map((it, i) => (
          <Marker key={it.key} position={it.coords!} icon={iconFor(it, i)} title={it.title}
            zIndexOffset={it.key === target ? 1000 : 0} eventHandlers={{ click: () => onPick(it.key) }}>
            {/* The target's name stays next to it: on satellite a pin alone is easy to miss. */}
            {it.key === target && <Tooltip permanent direction="top" offset={[0, -12]}>{it.title}</Tooltip>}
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
