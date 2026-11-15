"use client";

import { useState, type ReactNode } from "react";
import type { ZoneFC, ZoneMeta } from "./ZoneLayer";

type WeatherDay = NonNullable<ZoneMeta["weatherSeries"]>[number];
const METRICS = [
  { key: "minTempC", label: "Minimum temperature", unit: "°C", description: "Daily minimum air temperature at 2 m. Compare with shelter and blanket requests." },
  { key: "maxTempC", label: "Maximum temperature", unit: "°C", description: "Daily maximum air temperature at 2 m. Shows whether daytime conditions also stayed below freezing." },
  { key: "windMs", label: "Mean wind speed", unit: "m/s", description: "Daily mean wind speed at 2 m. Short gusts and local street conditions need separate observations." },
  { key: "humidityPct", label: "Relative humidity", unit: "%", description: "Daily mean relative humidity at 2 m. Adds weather context to field reports." },
  { key: "precipitationMm", label: "Precipitation", unit: "mm/day", description: "Daily precipitation total. This measurement alone cannot distinguish rain from snow." },
] as const;
type WeatherKey = typeof METRICS[number]["key"];
const dateLabel = (date: string) => new Date(date + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function NasaEvidence({ fc, children }: { fc: ZoneFC; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [metricKey, setMetricKey] = useState<WeatherKey>("minTempC");
  const series = fc.metadata?.temperatureSeries ?? [];
  const weather: WeatherDay[] = fc.metadata?.weatherSeries ?? series.map((sample) => ({ ...sample, maxTempC: null, humidityPct: null, precipitationMm: null, windMs: null }));
  const chosenDay = weather.find((sample) => sample.date === (date || fc.metadata?.dates?.temperatureDate)) ?? weather[0];
  const metric = METRICS.find((item) => item.key === metricKey)!;
  const coldest = series.reduce<{ date: string; minTempC: number } | undefined>(
    (best, sample) => !best || sample.minTempC < best.minTempC ? sample : best, undefined);
  const scale = Math.max(1, ...weather.map((sample) => Math.abs(sample[metricKey] ?? 0)));
  const withheld = fc.features.some((feature) => feature.properties.silentZone === null);

  return (
    <section aria-label="NASA evidence" className="absolute right-3 top-3 z-[1000] flex max-h-[calc(100%-1.5rem)] w-72 max-w-[calc(100%-4.5rem)] flex-col overflow-hidden rounded-card border border-line bg-card shadow-md md:w-80">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="nasa-evidence"
        className="w-full shrink-0 p-3 text-left">
        <span className="flex justify-between gap-3 text-sm font-bold">
          <span>NASA · Satellite & weather</span><span aria-hidden>{open ? "−" : "+"}</span>
        </span>
        {coldest && <span className="mt-1 block text-3xl font-bold tabular-nums">{coldest.minTempC.toFixed(2)} °C</span>}
        <span className="block text-xs text-muted">Coldest daily minimum · {coldest && dateLabel(coldest.date)}</span>
        <span className="block text-xs text-muted">Malatya city area · Historical observations</span>
        <span className="mt-1 block text-xs text-primary">{open ? "Hide evidence" : "View dates, sources and limitations"}</span>
      </button>
      {open && (
        <div id="nasa-evidence" className="min-h-0 overflow-y-auto border-t border-line p-3 text-sm">
          {children}
          {chosenDay && <>
            <label htmlFor="nasa-weather-date" className="block text-xs font-bold">Observation day</label>
            <select id="nasa-weather-date" className="mt-1 w-full rounded-button border border-line bg-card p-2" value={chosenDay.date} onChange={(event) => setDate(event.target.value)}>
              {weather.map((sample) => <option key={sample.date} value={sample.date}>{dateLabel(sample.date)}</option>)}
            </select>
            <dl className="mt-3 grid grid-cols-2 gap-2">
              {METRICS.map((item) => <div key={item.key} className="rounded-button border border-line p-2">
                <dt className="text-xs text-muted">{item.label}</dt>
                <dd className="mt-1 font-bold tabular-nums">{chosenDay[item.key]?.toFixed(2) ?? "Unavailable"} {chosenDay[item.key] != null && item.unit}</dd>
              </div>)}
            </dl>
          </>}
          {weather.length > 0 && <figure className="mt-4">
            <figcaption><label htmlFor="nasa-weather-metric" className="block text-xs font-bold">Five-day trend</label></figcaption>
            <select id="nasa-weather-metric" className="my-2 w-full rounded-button border border-line bg-card p-2" value={metricKey} onChange={(event) => setMetricKey(event.target.value as WeatherKey)}>
              {METRICS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
            <table className="w-full text-xs">
              <thead className="sr-only"><tr><th>Date</th><th>Magnitude</th><th>{metric.label}, {metric.unit}</th></tr></thead>
              <tbody>{weather.map((sample) => (
                <tr key={sample.date}>
                  <td className="whitespace-nowrap py-1 pr-2">{dateLabel(sample.date).replace(" 2023", "")}</td>
                  <td className="w-full pr-2" aria-hidden><span className={sample.date === chosenDay?.date ? "block h-3 bg-primary" : "block h-3 bg-calm"} style={{ width: `${Math.abs(sample[metricKey] ?? 0) / scale * 100}%` }} /></td>
                  <td className="whitespace-nowrap text-right tabular-nums">{sample[metricKey]?.toFixed(2) ?? "—"} {sample[metricKey] != null && metric.unit}</td>
                </tr>
              ))}</tbody>
            </table>
            <p className="mt-2 text-xs">{metric.description}</p>
            <p className="mt-2 text-xs text-muted">Bar length shows magnitude. Blue marks the selected day. NASA POWER / MERRA-2 · daily local solar time · approximately 50 km grid. Regional weather is shared across the mapped city area.</p>
          </figure>}
          <p className="mt-3">Cold exposure gives the coordinator a reason to review blanket and shelter requests.</p>
          {withheld && <details className="mt-3 border-t border-line pt-2">
            <summary className="cursor-pointer font-bold">Why satellite alerts are withheld</summary>
            <p className="mt-2 text-xs">ARIA radar · 10 Feb 2023 · about 30 m. Surface-change pixels are visible, but transparent pixels lack a reliable validity mask. A damaged-area percentage needs more information.</p>
            <p className="mt-2 text-xs">Black Marble · 3 Jan and 8 Feb 2023 · about 500 m. The city pixels reach the image brightness limit, so the comparison cannot establish a power outage.</p>
            <p className="mt-2 text-xs">A silent-zone alert requires evidence of damage and loss of light, alongside few calls. That evidence is incomplete here.</p>
          </details>}
          <p className="mt-3 flex flex-wrap gap-3 text-xs text-primary">
            {fc.metadata?.sourceURLs?.temperature && <a href={fc.metadata.sourceURLs.temperature} target="_blank" rel="noreferrer" className="underline">NASA temperature data</a>}
            {fc.metadata?.weatherSourceURL && <a href={fc.metadata.weatherSourceURL} target="_blank" rel="noreferrer" className="underline">NASA weather data</a>}
            <a href="/data/zones.geojson" target="_blank" rel="noreferrer" className="underline">Zone evidence</a>
          </p>
        </div>
      )}
    </section>
  );
}

