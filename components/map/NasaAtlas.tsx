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

function useBeforeCoverage() {
  const [fraction, setFraction] = useState<number | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/antakya/imagery.json", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (typeof data?.before?.coverageFraction === "number") setFraction(data.before.coverageFraction); })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return fraction;
}

export function NasaAtlasOverlay({ atlas, selection }: { atlas: NasaAtlas; selection: AtlasSelection }) {
  const frame = atlas.frames.find((item) => item.id === selection.frameId);
  const highres = frame?.tileURL ? (selection.compare ? atlas.frames.filter(item => item.tileURL) : [frame]) : [];
  const beforeFill = highres.some(item => item.kind === "highres-before") ? atlas.frames.find(item => item.id === "hls-before-2023-02-01") : undefined;
  const events = selection.eventScope === "off" ? [] : atlas.events.filter((event) => selection.eventScope === "global" || event.regional);
  return <>
    {frame && !frame.tileURL && <ImageOverlay key={frame.id} url={frame.image} bounds={frame.bounds} opacity={frame.kind.startsWith("hls") ? 1 : 0.75} zIndex={210} />}
    {highres.length > 0 && <HighResolution key={highres.map(f => f.id).join()} frames={highres} split={selection.compare ? selection.split ?? 50 : undefined} fill={beforeFill} />}
    <BuildingReferences visible={!!selection.showBuildings && highres.length > 0} />
    {frame?.kind === "radiance-change" && <RadiancePairs />}
    {frame && selection.showLimits && frame.limitation && <ImageOverlay key={frame.id + "-limits"} url={frame.limitsImage} bounds={frame.bounds} opacity={0.85} zIndex={220} />}
    {events.map((event) => <CircleMarker key={event.id} center={event.coords} radius={7} pathOptions={{ className: "stroke-primary fill-primary", fillOpacity: 0.8 }} pane="markerPane">
      <Popup><strong>{event.title}</strong><br />{event.categories.join(", ")}<br />Observation: {event.date}<br /><a href={event.sourceURL} target="_blank" rel="noreferrer">NASA EONET record</a></Popup>
    </CircleMarker>)}
  </>;
}

const PRIMARY_LAYERS = [
  { id: "highres", label: "Buildings · before / after", kinds: ["highres-before", "highres-after"] },
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
  const beforeCoverage = useBeforeCoverage();
  const hlsBefore = atlas.frames.find((item) => item.id === "hls-before-2023-02-01");
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
    <label htmlFor="nasa-view" className="block text-xs font-bold">Layer</label>
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

      <div className="flex gap-2">
        <button type="button" className="rounded-button border border-line px-3 py-2 text-primary" onClick={() => onLocate([36.194, 36.157])}>Zoom to buildings</button>
        <button type="button" onClick={onCityView} className="rounded-button border border-line px-3 py-2 text-primary">Fit city</button>
      </div>
      <details className="pt-1">
        <summary className="cursor-pointer font-medium">Building overlays</summary>
        <label className="mt-2 flex items-start gap-2"><input type="checkbox" checked={!!selection.showBuildings} onChange={e => onChange({ ...selection, showBuildings: e.target.checked })} />Building references · zoom 15+</label>
        {selection.showBuildings && <>
          <p className="text-muted">{atlas.highResolution?.buildingCount ?? 0} HOT/OSM references. Click an outline to review.</p>
          <ExportBuildingReviews />
        </>}
      </details>
    </div>}
    {group?.id === "lights" && <div className="mt-3 space-y-1 text-xs">
      <p><strong>{atlas.originalMeasurements?.pairedRadiance?.lightLossPixels ?? 0} / {atlas.originalMeasurements?.pairedRadiance?.eligiblePixels ?? 0}</strong> valid pixels with ≥40% light loss</p>
      <p className="text-muted">Orange · light loss. Blue · other valid pixels. Click for values.</p>
      <p className="text-muted">500 m grid · Regional light change</p>
    </div>}
    {!frame?.tileURL && <button type="button" onClick={onCityView} className="mt-3 rounded-button border border-line px-3 py-2 text-sm text-primary hover:bg-primary-lighter">Fit city</button>}
    {frame && <p className="mt-2 text-xs">
      {frame.tileURL ? "Map tiles · ~1 m" : frame.scale} ·{" "}
      <a className="text-primary underline" href={frame.sourceURL} target="_blank" rel="noreferrer">{frame.tileURL ? "Maxar source" : "NASA source"}</a>
      {frame.legendURL && <> · <a className="text-primary underline" href={frame.legendURL} target="_blank" rel="noreferrer">Legend</a></>}
    </p>}
    {frame?.tileURL && beforeCoverage !== null && hlsBefore && <p className="mt-2 text-xs">
      Before · {Math.round(beforeCoverage * 100)}% high-res, remainder 30 m HLS.
    </p>}
    {selection.showLimits && frame?.limitation && <p className="mt-2 text-xs text-muted">Purple · limited observations</p>}
    <details className="mt-4 text-xs">
      <summary className="cursor-pointer font-bold">Sources & quality</summary>
      <label className="mt-3 flex items-start gap-2">
        <input type="checkbox" className="mt-0.5" checked={selection.showLimits} onChange={(event) => onChange({ ...selection, showLimits: event.target.checked })} />
        Observation limits · purple
      </label>
      {frame?.tileURL && <div className="mt-3 space-y-2">
        <p>{frame.scale}. Shadows and alignment differences require review.</p>
        <p>HOT/OSM outlines are external historical mappings. Automated damage detection has not been run.</p>
        {hlsBefore && <a className="text-primary underline" href={hlsBefore.sourceURL} target="_blank" rel="noreferrer">HLS gap-fill source</a>}
      </div>}
      {frame?.kind.startsWith("radiance") && <p className="mt-3">Black Marble compares quality-checked observations from 3 Jan and 8 Feb 2023. Light loss alone cannot establish building damage or occupancy.</p>}
      {frame?.limitation && <p className="mt-2">{frame.limitation} Flagged area: {(frame.limitedFraction * 100).toFixed(1)}%.</p>}
      <label htmlFor="nasa-analysis-layer" className="mt-3 block font-bold">Additional layers</label>
      <select id="nasa-analysis-layer" className="mt-1 w-full rounded-button border border-line bg-card p-2" value={group || !frame ? "" : selection.frameId}
        onChange={(event) => onChange({ ...selection, frameId: event.target.value || "hls-after-2023-02-09" })}>
        <option value="">Choose layer</option>
        {analysisFrames.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.date}</option>)}
      </select>
      <p className="mt-2 text-muted">Masks apply to the selected product and date. Transparent snow pixels can mean clear ground, cloud, water or missing data.</p>
      <details className="mt-3">
        <summary className="cursor-pointer font-bold">Scene availability and radiance</summary>
        {atlas.hlsScenes.map((scene) => <p key={scene.title} className="mt-2">{scene.date.slice(0, 10)} · whole-scene cloud cover {scene.sceneCloudPct ?? "unavailable"}%.</p>)}
        <p className="mt-2">HLS Sentinel-2 dates without matching scenes: {atlas.hlsMissingDates.join(", ") || "none"}.</p>
        <p className="mt-2">{atlas.originalMeasurements?.status}</p>
      </details>
      <label className="mt-3 flex items-start gap-2">
        <input type="checkbox" className="mt-0.5" checked={selection.showDemoCells} onChange={(event) => onChange({ ...selection, showDemoCells: event.target.checked })} />
        Demo scenario cells
      </label>
      <label htmlFor="nasa-events" className="mt-4 block font-bold">EONET · 6–10 Feb 2023</label>
      <select id="nasa-events" className="mt-1 w-full rounded-button border border-line bg-card p-2" value={selection.eventScope}
        onChange={(event) => onChange({ ...selection, eventScope: event.target.value as AtlasSelection["eventScope"] })}>
        <option value="off">Hidden</option><option value="regional">Antakya extent</option><option value="global">Worldwide catalogue results</option>
      </select>
      {selection.eventScope !== "off" && <div className="mt-2 space-y-2">
        {events.length === 0 && <p>No catalogue records in this area.</p>}
        {events.map((event) => <button type="button" className="block text-left text-primary underline" key={event.id} onClick={() => onLocate(event.coords)}>{event.title} · {event.date.slice(0, 10)}</button>)}
        <a className="block text-primary underline" href={atlas.eonetSourceURL} target="_blank" rel="noreferrer">NASA catalogue</a>
      </div>}
    </details>
  </div>;
}
