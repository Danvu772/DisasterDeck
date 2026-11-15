"use client";
// The small map at the top of the detail panel. The selected record gets the selected ring,
// everything else on the board is drawn faded for context, NASA zones underneath.
// Leaflet needs `window`: DetailPanel loads this with next/dynamic, ssr off.
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import type { LatLng } from "@/lib/types";
import type { MapItem } from "../map/mapItems";
import { icon, ringIcon, TILES, TILES_ATTR } from "../map/markers";
import { HatchDefs, useZones, ZoneLayer } from "../map/ZoneLayer";

const ZOOM = 16;

function Recenter({ to }: { to: LatLng }) {
  const map = useMap();
  const [lat, lng] = to;
  useEffect(() => { map.setView([lat, lng], ZOOM); }, [map, lat, lng]);
  return null;
}

export default function DetailMap({ items, selected, center, now, onPick }: {
  items: MapItem[]; selected: string; center: LatLng; now: number; onPick: (key: string) => void;
}) {
  const zones = useZones("/data/zones.geojson");
  const placed = items.filter((i) => i.coords);
  const hasMarker = placed.some((i) => i.key === selected);
  return (
    <div className="relative h-full w-full">
      <MapContainer center={center} zoom={ZOOM} className="h-full w-full" zoomControl>
        <TileLayer url={TILES} attribution={zones?.metadata?.attribution ? `${TILES_ATTR}. Zones: ${zones.metadata.attribution}` : TILES_ATTR} maxZoom={16} />
        {zones && <ZoneLayer fc={zones} />}
        <Recenter to={center} />
        {placed.map((it) => (
          <Marker key={it.key} position={it.coords!} title={it.title}
            icon={icon(it, it.key === selected, now, it.key !== selected)}
            zIndexOffset={it.key === selected ? 1000 : 0}
            eventHandlers={{ click: () => onPick(it.key) }} />
        ))}
        {!hasMarker && <Marker position={center} icon={ringIcon()} zIndexOffset={1000} interactive={false} />}
      </MapContainer>
      <HatchDefs />
    </div>
  );
}
