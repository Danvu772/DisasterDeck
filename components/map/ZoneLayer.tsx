"use client";
// NASA zones from Role 4's evidence GeoJSON (public/data/zones.geojson), not from the Zone
// records: the records have no shape and cannot hold "unknown". Unknown stays unknown here.
//   cold: true          → diagonal hatch
//   silentZone: true    → cross hatch
//   silentZone: null    → dashed outline only, "not evaluated"
import { useEffect, useState } from "react";
import { GeoJSON } from "react-leaflet";
import type { Feature, FeatureCollection, Polygon } from "geojson";

export interface ZoneProps {
  _id: string; name: string;
  silentZone: boolean | null; damage: number | null; dark: boolean | null;
  cold?: boolean; minTempC?: number; calls?: number;
  damageEvidence?: { quality?: string };
  lightsEvidence?: { quality?: string };
  temperatureEvidence?: { date?: string; source?: string };
}
export interface ZoneMeta {
  dates?: { damageDate?: string; lightsAfterDate?: string; temperatureDate?: string };
  nativeResolutionMeters?: { damage?: number; nightLights?: number; temperatureApprox?: number };
  attribution?: string;
}
type ZoneFC = FeatureCollection<Polygon, ZoneProps> & { metadata?: ZoneMeta };

const QUALITY: Record<string, string> = {
  "saturated-rendering": "night lights are saturated in the rendering",
  "unflagged-validity-unknown": "valid damage pixels cannot be told apart",
};

function word(v: boolean | number | null, yes: string, no: string) {
  return v === null ? "unknown" : v === false ? no : typeof v === "number" ? String(v) : yes;
}

export function zoneText(p: ZoneProps): string {
  const lines = [`<b>${p.name}</b>`];
  if (p.cold) lines.push(`Cold night: ${p.minTempC?.toFixed(1)} °C minimum, ${p.temperatureEvidence?.source ?? "NASA POWER"}, ${p.temperatureEvidence?.date ?? ""}. Raises warmth needs by 20.`);
  if (p.silentZone === null) {
    const why = [p.lightsEvidence?.quality, p.damageEvidence?.quality]
      .map((q) => (q ? QUALITY[q] ?? q : null)).filter(Boolean).join(", ");
    lines.push(`Silent zone: not evaluated${why ? `, ${why}` : ""}.`);
  } else {
    lines.push(`Silent zone: ${p.silentZone ? "yes, raises priority by 30" : "no"}.`);
  }
  lines.push(`Damage ${word(p.damage, "yes", "none")}, power out ${word(p.dark, "yes", "no")}, calls ${p.calls ?? "unknown"}.`);
  return lines.join("<br>");
}

function className(p: ZoneProps): string {
  if (p.silentZone) return "fill-[url(#nasa-cross)] stroke-hatch";
  if (p.cold) return "fill-[url(#nasa-hatch)] stroke-hatch";
  return "fill-none stroke-hatch";
}

export function useZones(url: string) {
  const [fc, setFc] = useState<ZoneFC | null>(null);
  useEffect(() => {
    if (!url) return;
    fetch(url).then((r) => (r.ok ? r.json() : null)).then(setFc).catch(() => setFc(null));
  }, [url]);
  return fc;
}

// The hatch patterns. Any SVG on the page can use them with url(#id).
export function HatchDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden>
      <defs>
        <pattern id="nasa-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="8" className="stroke-hatch" strokeWidth="2" />
        </pattern>
        <pattern id="nasa-cross" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="8" className="stroke-hatch" strokeWidth="2" />
          <line x1="0" y1="0" x2="8" y2="0" className="stroke-hatch" strokeWidth="2" />
        </pattern>
      </defs>
    </svg>
  );
}

export function ZoneLayer({ fc }: { fc: ZoneFC }) {
  return (
    <GeoJSON
      key={fc.features.map((f) => f.properties._id).join()}
      data={fc}
      style={(f) => {
        const p = (f as Feature<Polygon, ZoneProps>).properties;
        return { className: className(p), weight: 2, dashArray: p.silentZone === null ? "6 6" : undefined, fillOpacity: 1 };
      }}
      onEachFeature={(f, layer) => layer.bindTooltip(zoneText(f.properties as ZoneProps), { sticky: true })}
    />
  );
}
