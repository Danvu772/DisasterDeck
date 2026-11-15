"use client";

import { useState } from "react";
import type { LatLng } from "@/lib/types";
import type { ZoneFC } from "./ZoneLayer";

export function NasaEvidence({ fc, onLocate }: { fc: ZoneFC; onLocate: (coords: LatLng) => void }) {
  const [open, setOpen] = useState(false);
  const series = fc.metadata?.temperatureSeries ?? [];
  const coldest = series.reduce<{ date: string; minTempC: number } | undefined>(
    (best, sample) => !best || sample.minTempC < best.minTempC ? sample : best, undefined);
  const scale = Math.max(1, ...series.map((sample) => Math.abs(sample.minTempC)));
  const withheld = fc.features.some((feature) => feature.properties.silentZone === null);

  return (
    <section aria-label="NASA evidence" className="absolute right-3 top-3 z-[1000] flex max-h-[calc(100%-1.5rem)] w-72 max-w-[calc(100%-4.5rem)] flex-col overflow-hidden rounded-card border border-line bg-card shadow-md md:w-80">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="nasa-evidence"
        className="w-full shrink-0 p-3 text-left">
        <span className="flex justify-between gap-3 text-sm font-bold">
          <span>NASA · Cold exposure</span><span aria-hidden>{open ? "−" : "+"}</span>
        </span>
        {coldest && <span className="mt-1 block text-3xl font-bold tabular-nums">{coldest.minTempC.toFixed(2)} °C</span>}
        <span className="block text-xs text-muted">Malatya · Historical regional weather</span>
        <span className="mt-1 block text-xs text-primary">{open ? "Hide evidence" : "View dates, sources and limitations"}</span>
      </button>
      {open && (
        <div id="nasa-evidence" className="min-h-0 overflow-y-auto border-t border-line p-3 text-sm">
          {series.length > 0 && <figure>
            <figcaption className="mb-2 font-bold">Daily minimum · February 2023</figcaption>
            <table className="w-full text-xs">
              <thead className="sr-only"><tr><th>Date</th><th>Temperature scale</th><th>Minimum °C</th></tr></thead>
              <tbody>{series.map((sample) => (
                <tr key={sample.date}>
                  <td className="whitespace-nowrap py-1 pr-2">{Number(sample.date.slice(-2))} Feb</td>
                  <td className="w-full pr-2" aria-hidden><span className={sample === coldest ? "block h-3 bg-primary" : "block h-3 bg-calm"} style={{ width: `${Math.abs(sample.minTempC) / scale * 100}%` }} /></td>
                  <td className="whitespace-nowrap text-right tabular-nums">{sample.minTempC.toFixed(2)} °C</td>
                </tr>
              ))}</tbody>
            </table>
            <p className="mt-2 text-xs text-muted">NASA POWER / MERRA-2 · daily local solar time · approximately 50 km grid. Both demo cells share this measurement.</p>
          </figure>}
          <p className="mt-3">Cold exposure gives the coordinator a reason to review blanket and shelter requests.</p>
          <div className="mt-3 space-y-1">
            {fc.features.map((feature) => {
              const ring = feature.geometry.coordinates[0];
              const lat = (ring[0][1] + ring[2][1]) / 2;
              const lng = (ring[0][0] + ring[2][0]) / 2;
              return <button key={feature.properties._id} type="button" onClick={() => onLocate([lat, lng])}
                className="block w-full rounded-button border border-line px-2 py-1 text-left text-primary hover:bg-primary-lighter">
                Locate {feature.properties.name.replace(" demo cell", "")}
              </button>;
            })}
          </div>
          <p className="mt-2 text-xs text-muted">The outlined 500 m cells are synthetic exercise areas.</p>
          {withheld && <details className="mt-3 border-t border-line pt-2">
            <summary className="cursor-pointer font-bold">Why satellite alerts are withheld</summary>
            <p className="mt-2 text-xs">ARIA radar · 10 Feb 2023 · about 30 m. Surface-change pixels are visible, but transparent pixels lack a reliable validity mask. A damaged-area percentage needs more information.</p>
            <p className="mt-2 text-xs">Black Marble · 3 Jan and 8 Feb 2023 · about 500 m. The city pixels reach the image brightness limit, so the comparison cannot establish a power outage.</p>
            <p className="mt-2 text-xs">A silent-zone alert requires evidence of damage and loss of light, alongside few calls. That evidence is incomplete here.</p>
          </details>}
          <p className="mt-3 flex flex-wrap gap-3 text-xs text-primary">
            {fc.metadata?.sourceURLs?.temperature && <a href={fc.metadata.sourceURLs.temperature} target="_blank" rel="noreferrer" className="underline">NASA temperature data</a>}
            <a href="/data/zones.geojson" target="_blank" rel="noreferrer" className="underline">Zone evidence</a>
          </p>
        </div>
      )}
    </section>
  );
}

