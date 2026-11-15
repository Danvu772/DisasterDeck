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
  cityName?: string;
  weatherSeries?: { date: string; minTempC: number | null; maxTempC: number | null; humidityPct: number | null; precipitationMm: number | null; windMs: number | null }[];
  weatherSourceURL?: string;
  dates?: { damageDate?: string; lightsAfterDate?: string; temperatureDate?: string };
  temperatureSeries?: { date: string; minTempC: number }[];
  sourceURLs?: { temperature?: string; damage?: string; nightLights?: string };
  nativeResolutionMeters?: { damage?: number; nightLights?: number; temperatureApprox?: number };
  attribution?: string;
}
export type ZoneFC = FeatureCollection<Polygon, ZoneProps> & { metadata?: ZoneMeta };

const QUALITY: Record<string, string> = {
  "saturated-rendering": "the night-light image reaches its brightness limit",
  "unflagged-validity-unknown": "the radar image lacks a reliable valid-area mask",
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export function zoneText(p: ZoneProps): string {
  const lines = [`<b>${escapeHtml(p.name)}</b>`];
  if (p.minTempC !== undefined) lines.push(`<b>${p.minTempC.toFixed(2)} °C</b> regional minimum · ${escapeHtml(p.temperatureEvidence?.date ?? "")}`);
  lines.push(escapeHtml(p.temperatureEvidence?.source ?? "NASA POWER"), "Shared regional weather measurement · approximately 50 km grid.");
  if (p.cold) lines.push("Cold exposure: review blanket and shelter requests.");
  if (p.silentZone === null) {
    const why = [p.lightsEvidence?.quality, p.damageEvidence?.quality]
      .map((q) => (q ? QUALITY[q] ?? q : null)).filter(Boolean).join(", ");
    lines.push(`Satellite assessment needs better coverage${why ? `: ${escapeHtml(why)}` : ""}.`);
  } else {
    lines.push(`Silent-zone signal: ${p.silentZone ? "detected; coordinator review needed" : "not detected"}.`);
  }
  if (p.damage != null) lines.push(`Damage proxy: ${(p.damage * 100).toFixed(1)}%.`);
  if (p.dark != null) lines.push(`Night-light drop: ${p.dark ? "detected" : "not detected"}.`);
  if (p.calls != null) lines.push(`Synthetic original calls: ${p.calls}. Demo cell: 500 m.`);
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
        // map-fade-in: the layer appears once, when it mounts (globals.css). Nothing repeats.
        return { className: `${className(p)} map-fade-in`, weight: 2, dashArray: p.silentZone === null ? "6 6" : undefined, fillOpacity: 1 };
      }}
      onEachFeature={(f, layer) => {
        const p = f.properties as ZoneProps;
        layer.bindTooltip(`${escapeHtml(p.name)} · ${p.minTempC?.toFixed(2) ?? "—"} °C`, { sticky: true });
        layer.bindPopup(zoneText(p), { maxWidth: 330 });
      }}
    />
  );
}
