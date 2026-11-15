"use client";

import { useEffect, useState } from "react";
import { CircleMarker, ImageOverlay, Popup } from "react-leaflet";
import type { LatLng } from "@/lib/types";

export interface AtlasFrame {
  id: string; kind: string; title: string; date: string; image: string;
  bounds: [LatLng, LatLng]; scale: string; sourceURL: string;
  renderedCoverage: number; limitsImage: string; limitedFraction: number;
  limitation: string; legendURL: string | null;
}
interface AtlasEvent {
  id: string; title: string; date: string; coords: LatLng; regional: boolean;
  sourceURL: string; categories: string[];
}
export interface NasaAtlas {
  dates: string[]; frames: AtlasFrame[]; events: AtlasEvent[];
  eonetSourceURL: string; limitsMeaning: string;
  hlsScenes: { title: string; date: string; sceneCloudPct?: string }[];
  hlsMissingDates: string[];
  originalMeasurements?: { status: string; zones?: { name: string; before?: number | null; after?: number | null; beforeValid: number; afterValid: number }[] };
}
export interface AtlasSelection { frameId: string; showLimits: boolean; eventScope: "off" | "regional" | "global" }

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
  const events = selection.eventScope === "off" ? [] : atlas.events.filter((event) => selection.eventScope === "global" || event.regional);
  return <>
    {frame && <ImageOverlay key={frame.id} url={frame.image} bounds={frame.bounds} opacity={0.75} zIndex={210} />}
    {frame && selection.showLimits && frame.limitation && <ImageOverlay key={frame.id + "-limits"} url={frame.limitsImage} bounds={frame.bounds} opacity={0.85} zIndex={220} />}
    {events.map((event) => <CircleMarker key={event.id} center={event.coords} radius={7} pathOptions={{ className: "stroke-primary fill-primary", fillOpacity: 0.8 }} pane="markerPane">
      <Popup><strong>{event.title}</strong><br />{event.categories.join(", ")}<br />Observation: {event.date}<br /><a href={event.sourceURL} target="_blank" rel="noreferrer">NASA EONET record</a></Popup>
    </CircleMarker>)}
  </>;
}

export function NasaAtlasControls({ atlas, selection, onChange, onLocate }: {
  atlas: NasaAtlas; selection: AtlasSelection; onChange: (selection: AtlasSelection) => void; onLocate: (coords: LatLng) => void;
}) {
  const frame = atlas.frames.find((item) => item.id === selection.frameId);
  const events = atlas.events.filter((event) => selection.eventScope === "global" || event.regional);
  return <details open className="mb-4 border-b border-line pb-3">
    <summary className="cursor-pointer font-bold">Satellite layers & observation limits</summary>
    <label htmlFor="nasa-layer" className="mt-3 block text-xs font-bold">Image and acquisition date</label>
    <select id="nasa-layer" className="mt-1 w-full rounded-button border border-line bg-card p-2 text-xs" value={selection.frameId}
      onChange={(event) => onChange({ ...selection, frameId: event.target.value })}>
      <option value="">Base map</option>
      {atlas.frames.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.date}</option>)}
    </select>
    {frame && <>
      <p className="mt-2 text-xs">{frame.scale} · {frame.date}. Visible rendered area: {(frame.renderedCoverage * 100).toFixed(1)}% of the image extent.</p>
      <button type="button" className="mt-2 text-xs text-primary underline" onClick={() => onLocate([(frame.bounds[0][0] + frame.bounds[1][0]) / 2, (frame.bounds[0][1] + frame.bounds[1][1]) / 2])}>Locate image area</button>
      {frame.legendURL && <p className="mt-2 text-xs"><a className="text-primary underline" href={frame.legendURL} target="_blank" rel="noreferrer">Open NASA color scale</a></p>}
      <p className="mt-2 text-xs"><a className="text-primary underline" href={frame.sourceURL} target="_blank" rel="noreferrer">Source image or product</a></p>
      {frame.limitation ? <>
        <label className="mt-3 flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5" checked={selection.showLimits} onChange={(event) => onChange({ ...selection, showLimits: event.target.checked })} />Show observation limits (purple)</label>
        <p className="mt-2 text-xs">{frame.limitation}</p>
        <p className="mt-1 text-xs text-muted">Flagged rendered area: {(frame.limitedFraction * 100).toFixed(1)}%. The remaining area still needs product quality checks.</p>
      </> : <p className="mt-2 text-xs text-muted">Transparency alone cannot establish cloud cover or absence of snow or precipitation. Use the MODIS cloud layer for a separate cloud observation.</p>}
    </>}
    <p className="mt-3 text-xs text-muted">Optical clouds, gaps between acquisitions and clipped browse pixels describe different limits. Each overlay applies to its selected product and date.</p>
    <details className="mt-3 text-xs">
      <summary className="cursor-pointer font-bold">HLS scene availability</summary>
      {atlas.hlsScenes.map((scene) => <p key={scene.title} className="mt-2">{scene.date.slice(0, 10)} · scene cloud cover {scene.sceneCloudPct ?? "unavailable"}%. This percentage describes the whole satellite scene.</p>)}
      <p className="mt-2">Dates without matching HLS Sentinel-2 scenes in the queried area: {atlas.hlsMissingDates.join(", ") || "none"}. Select an acquisition-gap layer to see the queried extent.</p>
    </details>
    <details className="mt-3 text-xs">
      <summary className="cursor-pointer font-bold">Original radiance and quality flags</summary>
      <p className="mt-2">{atlas.originalMeasurements?.status ?? "Original NASA files require Earthdata sign-in. Browse images remain available."}</p>
      {atlas.originalMeasurements?.zones?.map((zone) => <p className="mt-2" key={zone.name}>{zone.name}: {zone.before?.toFixed(2) ?? "insufficient valid pixels"} → {zone.after?.toFixed(2) ?? "insufficient valid pixels"} nW/(cm² sr). Valid samples: {zone.beforeValid} / {zone.afterValid}.</p>)}
    </details>
    <label htmlFor="nasa-events" className="mt-4 block text-xs font-bold">EONET event catalogue · 6–10 Feb 2023</label>
    <select id="nasa-events" className="mt-1 w-full rounded-button border border-line bg-card p-2 text-xs" value={selection.eventScope}
      onChange={(event) => onChange({ ...selection, eventScope: event.target.value as AtlasSelection["eventScope"] })}>
      <option value="off">Hidden</option><option value="regional">Malatya extent</option><option value="global">Worldwide catalogue results</option>
    </select>
    {selection.eventScope !== "off" && <div className="mt-2 space-y-2 text-xs">
      {events.length === 0 && <p>No EONET records returned for this area and query window. Local reports and other hazard sources still matter.</p>}
      {events.map((event) => <button type="button" className="block text-left text-primary underline" key={event.id} onClick={() => onLocate(event.coords)}>{event.title} · {event.date.slice(0, 10)}</button>)}
      <a className="block text-primary underline" href={atlas.eonetSourceURL} target="_blank" rel="noreferrer">NASA catalogue response</a>
    </div>}
    <details className="mt-3 text-xs">
      <summary className="cursor-pointer font-bold">Prithvi flood and burn-scar workflows</summary>
      <p className="mt-2">These models require appropriate multispectral inputs and validation for a flood or fire. No model inference has been run on this earthquake exercise.</p>
      <p className="mt-2"><a className="text-primary underline" href="https://huggingface.co/ibm-nasa-geospatial" target="_blank" rel="noreferrer">NASA / IBM model cards and examples</a></p>
    </details>
  </details>;
}
