"use client";
// The board's big map. Same markers as /map (markers.ts), NASA zones underneath.
// The selected record gets the selected ring, clicking a marker selects it.
// Leaflet needs `window`: LiveBoard loads this with next/dynamic, ssr off.
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import type { LatLng } from "@/lib/types";
import type { MapItem } from "../map/mapItems";
import { icon, ringIcon, TILES, TILES_ATTR } from "../map/markers";
import { HatchDefs, useZones, ZoneLayer } from "../map/ZoneLayer";
import { BoardLegend } from "./BoardLegend";

function FitOnce({ points }: { points: LatLng[] }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || points.length === 0) return;
    done.current = true;
    if (points.length === 1) map.setView(points[0], 15);
    else map.fitBounds(points, { padding: [40, 40], maxZoom: 16 });
  }, [map, points]);
  return null;
}

// Leaflet measures its box once. Re-measure whenever the layout moves it.
function KeepSized() {
  const map = useMap();
  useEffect(() => {
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map]);
  return null;
}

// Fly when the selection changes, not on every poll.
function FlyTo({ id, to }: { id?: string; to?: LatLng }) {
  const map = useMap();
  const [lat, lng] = to ?? [];
  useEffect(() => {
    if (id && lat !== undefined && lng !== undefined) map.flyTo([lat, lng], Math.max(map.getZoom(), 15), { duration: 0.4 });
  }, [map, id, lat, lng]);
  return null;
}

export default function BoardMap({ items, now, ring, ringAt, fly, onPick }: {
  items: MapItem[]; now: number;
  ring?: string;          // the marker key that gets the selected ring
  ringAt?: LatLng;        // where the selection is, also when no marker has that key (an open road)
  fly?: string;           // set to the selected key to fly there. Unset for the automatic pick, so the first view stays the overview
  onPick: (key: string) => void;
}) {
  const zones = useZones("/data/zones.geojson");
  const placed = items.filter((i) => i.coords);
  const hasMarker = placed.some((i) => i.key === ring);
  return (
    <div className="relative h-full w-full">
      <MapContainer center={[38.35, 38.31]} zoom={13} className="h-full w-full" zoomControl>
        <TileLayer url={TILES} attribution={zones?.metadata?.attribution ? `${TILES_ATTR}. Zones: ${zones.metadata.attribution}` : TILES_ATTR} maxZoom={16} />
        <KeepSized />
        {zones && <ZoneLayer fc={zones} />}
        <FitOnce points={placed.map((i) => i.coords!)} />
        <FlyTo id={fly} to={ringAt} />
        {placed.map((it) => (
          <Marker key={it.key} position={it.coords!} title={it.title}
            icon={icon(it, it.key === ring, now)}
            zIndexOffset={it.key === ring ? 1000 : it.kind === "incident" ? 500 : 0}
            eventHandlers={{ click: () => onPick(it.key) }} />
        ))}
        {ringAt && !hasMarker && <Marker position={ringAt} icon={ringIcon()} zIndexOffset={1000} interactive={false} />}
      </MapContainer>
      <HatchDefs />
      <BoardLegend zones={!!zones} />
    </div>
  );
}
