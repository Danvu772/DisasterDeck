"use client";

import { useEffect, useState } from "react";
import { CircleMarker, ImageOverlay, Popup } from "react-leaflet";
import type { LatLng } from "@/lib/types";
import { BuildingReferences, ExportBuildingReviews, HighResolution, RadiancePairs } from "./HighResolution";

export interface AtlasFrame {
  id: string; kind: string; title: string; date: string; image: string;
  bounds: [LatLng, LatLng]; scale: string; sourceURL: string;
  renderedCoverage: number; limitsImage: string; limitedFraction: number;
  limitation: string; legendURL: string | null;
  tileURL?: string;
}
interface AtlasEvent {
  id: string; title: string; date: string; coords: LatLng; regional: boolean;
  sourceURL: string; categories: string[];
}
export interface NasaAtlas {
  bbox: [number, number, number, number];
  dates: string[]; frames: AtlasFrame[]; events: AtlasEvent[];
  eonetSourceURL: string; limitsMeaning: string;
  hlsScenes: { title: string; date: string; sceneCloudPct?: string }[];
  hlsMissingDates: string[];
  cityName?: string;
  highResolution?: { buildingCount: number; sourceURL: string; limitations: string };
  originalMeasurements?: { status: string; pairedRadiance?: { eligiblePixels: number; lightLossPixels: number; totalPixels: number }; zones?: { name: string; before?: number | null; after?: number | null; beforeValid: number; afterValid: number }[] };
}
export interface AtlasSelection { frameId: string; showLimits: boolean; eventScope: "off" | "regional" | "global"; showDemoCells: boolean; compare?: boolean; split?: number; showBuildings?: boolean }

export function useNasaAtlas() {
  const [atlas, setAtlas] = useState<NasaAtlas | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/nasa-atlas/atlas.json", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then(setAtlas).catch(() => {});
    return () => controller.abort();
  }, []);
  return atlas;
}

export function NasaAtlasOverlay({ atlas, selection }: { atlas: NasaAtlas; selection: AtlasSelection }) {
  const frame = atlas.frames.find((item) => item.id === selection.frameId);
  const highres = frame?.tileURL ? (selection.compare ? atlas.frames.filter(item => item.tileURL) : [frame]) : [];
  const events = selection.eventScope === "off" ? [] : atlas.events.filter((event) => selection.eventScope === "global" || event.regional);
  return <>
    {frame && !frame.tileURL && <ImageOverlay key={frame.id} url={frame.image} bounds={frame.bounds} opacity={frame.kind.startsWith("hls") ? 1 : 0.75} zIndex={210} />}
    {highres.length > 0 && <HighResolution key={highres.map(f => f.id).join()} frames={highres} split={selection.compare ? selection.split ?? 50 : undefined} />}
    <BuildingReferences visible={!!selection.showBuildings && highres.length > 0} />
    {frame?.kind === "radiance-change" && <RadiancePairs />}
    {frame && selection.showLimits && frame.limitation && <ImageOverlay key={frame.id + "-limits"} url={frame.limitsImage} bounds={frame.bounds} opacity={0.85} zIndex={220} />}
    {events.map((event) => <CircleMarker key={event.id} center={event.coords} radius={7} pathOptions={{ className: "stroke-primary fill-primary", fillOpacity: 0.8 }} pane="markerPane">
      <Popup><strong>{event.title}</strong><br />{event.categories.join(", ")}<br />Observation: {event.date}<br /><a href={event.sourceURL} target="_blank" rel="noreferrer">NASA EONET record</a></Popup>
    </CircleMarker>)}
  </>;
}

const PRIMARY_LAYERS = [
  { id: "highres", label: "Buildings · high-resolution comparison", kinds: ["highres-before", "highres-after"] },
  { id: "imagery", label: "Satellite image", kinds: ["hls-before", "hls-after"] },
  { id: "snow", label: "Snow", kinds: ["snow"] },
  { id: "precipitation", label: "Precipitation", kinds: ["precipitation"] },
  { id: "lights", label: "NASA · Night-light change", kinds: ["radiance-change", "radiance"] },
];

export function NasaAtlasControls({ atlas, selection, onChange, onLocate, onCityView }: {
  atlas: NasaAtlas; selection: AtlasSelection; onChange: (selection: AtlasSelection) => void;
  onLocate: (coords: LatLng) => void; onCityView: () => void;
}) {
  const frame = atlas.frames.find((item) => item.id === selection.frameId);
  const group = PRIMARY_LAYERS.find((item) => item.kinds.includes(frame?.kind ?? ""));
  const frames = atlas.frames.filter((item) => group?.kinds.includes(item.kind));
  const analysisFrames = atlas.frames.filter((item) => !PRIMARY_LAYERS.some((layer) => layer.kinds.includes(item.kind)));
  const events = atlas.events.filter((event) => selection.eventScope === "global" || event.regional);

  function chooseLayer(id: string) {
    const kinds = PRIMARY_LAYERS.find((item) => item.id === id)?.kinds ?? [];
    const candidates = atlas.frames.filter((item) => kinds.includes(item.kind));
    const closest = id === "lights" ? candidates.find(item => item.kind === "radiance-change") : candidates.sort((a, b) =>
      Math.abs(Date.parse(a.date) - Date.parse(frame?.date ?? "2023-02-09")) -
      Math.abs(Date.parse(b.date) - Date.parse(frame?.date ?? "2023-02-09")))[0];
    onChange({ ...selection, frameId: closest?.id ?? "" });
  }

  return <div className="mb-4 border-b border-line pb-3">
    <label htmlFor="nasa-view" className="block text-xs font-bold">Map view</label>
    <select id="nasa-view" className="mt-1 w-full rounded-button border border-line bg-card p-2 text-sm" value={group?.id ?? (frame ? "analysis" : "")}
      onChange={(event) => chooseLayer(event.target.value)}>
      <option value="">Street map</option>
      {PRIMARY_LAYERS.map((layer) => <option key={layer.id} value={layer.id}>{layer.label}</option>)}
      {frame && !group && <option value="analysis">Detailed analysis</option>}
    </select>
    {group && !(frame?.tileURL && selection.compare) && <div className="mt-3">
      <label htmlFor="nasa-image-date" className="block text-xs font-bold">Image date</label>
      <select id="nasa-image-date" className="mt-1 w-full rounded-button border border-line bg-card p-2 text-sm" value={selection.frameId}
        onChange={(event) => onChange({ ...selection, frameId: event.target.value })}>
        {frames.map((item) => <option key={item.id} value={item.id}>{item.date}</option>)}
      </select>
    </div>}
    {frame?.tileURL && <div className="mt-3 space-y-2 text-xs">
      <label className="flex items-center gap-2"><input type="checkbox" checked={selection.compare ?? true} onChange={e => onChange({ ...selection, compare: e.target.checked })} />Compare before / after</label>
      {selection.compare && <>
        <label htmlFor="imagery-swipe" className="block">Before · 22 Dec 2022 ← → After · 11 Feb 2023</label>
        <input id="imagery-swipe" aria-label="Before and after image divider" className="w-full" type="range" min="0" max="100" value={selection.split ?? 50} onChange={e => onChange({ ...selection, split: Number(e.target.value) })} />
      </>}
      <button type="button" className="rounded-button border border-line px-3 py-2 text-primary" onClick={() => onLocate([36.194, 36.157])}>Inspect buildings up close</button>
      <label className="flex items-start gap-2"><input type="checkbox" checked={!!selection.showBuildings} onChange={e => onChange({ ...selection, showBuildings: e.target.checked })} />Show mapped destroyed buildings (zoom 15+)</label>
      <p className="text-muted">Blue outlines are clickable historical building references.</p>
      <p>{atlas.highResolution?.buildingCount ?? 0} historical HOT/OSM reference polygons in this city extent. Click a building to inspect its source and record a local review. These are external mappings; no damage model has been run by our app.</p>
      <ExportBuildingReviews />
      <p className="text-muted">High-resolution coverage is the central study area. Street maps remain available outside it. Shadows, different view angles and mapping offsets require review.</p>
    </div>}
    {group?.id === "lights" && <p className="mt-3 text-xs">
      {atlas.originalMeasurements?.pairedRadiance?.lightLossPixels ?? 0} pixels show at least 40% lower radiance among {atlas.originalMeasurements?.pairedRadiance?.eligiblePixels ?? 0} eligible paired observations.
      Orange: lower radiance. Blue: other eligible pairs. Unavailable pixels are transparent; enable observation limits to locate excluded pairs. Each pixel is about 500 m. Click a grid cell for the measured values.
    </p>}
    <button type="button" onClick={onCityView} className="mt-3 rounded-button border border-line px-3 py-2 text-sm text-primary hover:bg-primary-lighter">Show whole city area</button>
    <p className="mt-2 text-xs text-muted">Antakya and surroundings. Pan and zoom to choose a neighbourhood. Source dates are historical.</p>
    {frame && <p className="mt-2 text-xs">
      {frame.scale} · {frame.date}.{" "}
      <a className="text-primary underline" href={frame.sourceURL} target="_blank" rel="noreferrer">{frame.tileURL ? "Maxar source & license" : "NASA source"}</a>
      {frame.legendURL && <> · <a className="text-primary underline" href={frame.legendURL} target="_blank" rel="noreferrer">Color scale</a></>}
    </p>}
    {selection.showLimits && frame?.limitation && <p className="mt-2 text-xs">Purple marks selected observation limits. {frame.limitation}</p>}
    <details className="mt-4 text-xs">
      <summary className="cursor-pointer font-bold">Quality & additional sources</summary>
      <label className="mt-3 flex items-start gap-2">
        <input type="checkbox" className="mt-0.5" checked={selection.showLimits} onChange={(event) => onChange({ ...selection, showLimits: event.target.checked })} />
        Show observation limits (purple)
      </label>
      {frame?.limitation && <p className="mt-2">{frame.limitation} Flagged area: {(frame.limitedFraction * 100).toFixed(1)}%.</p>}
      <label htmlFor="nasa-analysis-layer" className="mt-3 block font-bold">Cloud, acquisition gap or original quality layer</label>
      <select id="nasa-analysis-layer" className="mt-1 w-full rounded-button border border-line bg-card p-2" value={group || !frame ? "" : selection.frameId}
        onChange={(event) => onChange({ ...selection, frameId: event.target.value || "hls-after-2023-02-09" })}>
        <option value="">Choose a detailed layer</option>
        {analysisFrames.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.date}</option>)}
      </select>
      <p className="mt-2 text-muted">Each mask applies to one product and date. Unmarked areas still need quality checks. Transparent snow pixels can include snow-free ground, clouds, water or missing data.</p>
      <details className="mt-3">
        <summary className="cursor-pointer font-bold">Scene availability and radiance</summary>
        {atlas.hlsScenes.map((scene) => <p key={scene.title} className="mt-2">{scene.date.slice(0, 10)} · whole-scene cloud cover {scene.sceneCloudPct ?? "unavailable"}%.</p>)}
        <p className="mt-2">HLS Sentinel-2 dates without matching scenes: {atlas.hlsMissingDates.join(", ") || "none"}.</p>
        <p className="mt-2">{atlas.originalMeasurements?.status}</p>
      </details>
      <label className="mt-3 flex items-start gap-2">
        <input type="checkbox" className="mt-0.5" checked={selection.showDemoCells} onChange={(event) => onChange({ ...selection, showDemoCells: event.target.checked })} />
        Show two synthetic scenario cells
      </label>
      <label htmlFor="nasa-events" className="mt-4 block font-bold">EONET · 6–10 Feb 2023</label>
      <select id="nasa-events" className="mt-1 w-full rounded-button border border-line bg-card p-2" value={selection.eventScope}
        onChange={(event) => onChange({ ...selection, eventScope: event.target.value as AtlasSelection["eventScope"] })}>
        <option value="off">Hidden</option><option value="regional">Antakya extent</option><option value="global">Worldwide catalogue results</option>
      </select>
      {selection.eventScope !== "off" && <div className="mt-2 space-y-2">
        {events.length === 0 && <p>No EONET records returned here. Other hazard sources and local reports still matter.</p>}
        {events.map((event) => <button type="button" className="block text-left text-primary underline" key={event.id} onClick={() => onLocate(event.coords)}>{event.title} · {event.date.slice(0, 10)}</button>)}
        <a className="block text-primary underline" href={atlas.eonetSourceURL} target="_blank" rel="noreferrer">NASA catalogue response</a>
      </div>}
    </details>
  </div>;
}
