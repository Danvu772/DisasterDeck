"use client";
// The board's map: one dot per record with a place, coloured by tier through CSS classes
// (theme.css), so no colour is written here. Click a dot to select the record.
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { LatLng, Tier } from "@/lib/types";
import { TILES, TILES_ATTR } from "../map/markers";

export interface MapDot {
  key: string;
  coords: LatLng;
  tier: Tier;
  kind: "site" | "need" | "incident" | "shelter" | "road";
  title: string;
}

function Fit({ dots }: { dots: MapDot[] }) {
  const map = useMap();
  const sig = dots.map((d) => d.key).join("|");
  useEffect(() => {
    if (dots.length === 0) return;
    map.fitBounds(dots.map((d) => d.coords), { padding: [40, 40], maxZoom: 15 });
    // fit once per set of records, not on every poll
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function FlyTo({ dot }: { dot?: MapDot }) {
  const map = useMap();
  useEffect(() => {
    if (dot) map.flyTo(dot.coords, Math.max(map.getZoom(), 14), { duration: 0.6 });
  }, [dot?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export default function V2MapView({ dots, selected, onPick }: {
  dots: MapDot[]; selected?: string; onPick: (key: string) => void;
}) {
  const center: LatLng = dots[0]?.coords ?? [38.355, 38.309];
  return (
    <MapContainer center={center} zoom={13} scrollWheelZoom className="h-full w-full" style={{ minHeight: 420 }}>
      <TileLayer url={TILES} attribution={TILES_ATTR} />
      <Fit dots={dots} />
      <FlyTo dot={dots.find((d) => d.key === selected)} />
      {dots.map((d) => {
        const on = d.key === selected;
        const radius = d.kind === "incident" ? 11 : d.kind === "shelter" ? 9 : d.kind === "road" ? 7 : 10;
        return (
          <CircleMarker key={d.key} center={d.coords} radius={on ? radius + 4 : radius}
            pathOptions={{ className: `v2-dot v2-dot-${d.kind} v2-dot-t${d.tier}${on ? " v2-dot-on" : ""}` }}
            eventHandlers={{ click: () => onPick(d.key) }}>
            <Tooltip direction="top" offset={[0, -8]} permanent={on}>{d.title}</Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
