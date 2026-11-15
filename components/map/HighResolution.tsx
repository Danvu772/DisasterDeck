"use client";

import { useEffect, useRef, useState } from "react";
import { GeoJSON, ImageOverlay, Pane, TileLayer, useMap } from "react-leaflet";
import type L from "leaflet";
import type { FeatureCollection, Geometry } from "geojson";
import type { AtlasFrame } from "./NasaAtlas";

export function HighResolution({ frames, split, fill }: { frames: AtlasFrame[]; split?: number; fill?: AtlasFrame }) {
  const map = useMap();
  const afterPane = useRef<HTMLElement | null>(null);
  const fillPane = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (split === undefined) return;
    const clip = () => {
      const size = map.getSize();
      const side = (x0: number, x1: number) => [[x0, 0], [x1, 0], [x1, size.y], [x0, size.y]]
        .map(([x, y]) => map.containerPointToLayerPoint([x, y])).map(p => `${p.x}px ${p.y}px`);
      const cut = size.x * split / 100;
      if (afterPane.current) afterPane.current.style.clipPath = `polygon(${side(cut, size.x)})`;
      if (fillPane.current) fillPane.current.style.clipPath = `polygon(${side(0, cut)})`;
    };
    clip();
    map.on("move zoom resize", clip);
    return () => { map.off("move zoom resize", clip); };
  }, [map, split]);
  return <>
    {fill && <Pane name="antakya-before-fill" ref={(pane) => { fillPane.current = pane; }} style={{ zIndex: 209 }}>
      <ImageOverlay url={fill.image} bounds={fill.bounds} pane="antakya-before-fill" />
    </Pane>}
    {frames.map((frame, index) => <Pane key={frame.id} name={`antakya-${frame.id}`}
      ref={index === 1 ? (pane) => { afterPane.current = pane; } : undefined} style={{ zIndex: 210 + index }}>
      <TileLayer url={frame.tileURL!} bounds={frame.bounds} minNativeZoom={11} maxNativeZoom={17} maxZoom={21}
        noWrap attribution='Imagery © Maxar Open Data, CC BY-NC 4.0' />
    </Pane>)}
  </>;
}

interface BuildingProperties { referenceId: string; assessment: string; source?: string; [key: string]: unknown }
type Buildings = FeatureCollection<Geometry, BuildingProperties>;
const STORAGE = "antakya-building-review-v1";

export function BuildingReferences({ visible }: { visible: boolean }) {
  const [data, setData] = useState<Buildings | null>(null);
  const [zoom, setZoom] = useState(0);
  const map = useMap();
  useEffect(() => {
    const update = () => setZoom(map.getZoom());
    update(); map.on("zoomend", update);
    return () => { map.off("zoomend", update); };
  }, [map]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/antakya/buildings.geojson", { signal: controller.signal })
      .then(r => r.ok ? r.json() : null).then(setData).catch(() => {});
    return () => controller.abort();
  }, []);
  if (!visible || !data || zoom < 15) return null;
  function popup(feature: Buildings["features"][number], layer: L.Layer) {
    const p = feature.properties;
    const el = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = `Mapped destroyed building · ${p.referenceId}`;
    const detail = document.createElement("p");
    detail.textContent = `HOT / OpenStreetMap historical reference. Event: 6 Feb 2023. Mapping source: ${p.source ?? "unspecified"}. This is an external reference, with no prediction by our app. View-angle and positional differences need human review.`;
    const label = document.createElement("label");
    label.textContent = "Your local review ";
    const select = document.createElement("select");
    for (const [value, text] of [["", "Not reviewed"], ["needs-field-check", "Needs field check"], ["visible-change", "Visible change in images"], ["uncertain", "Uncertain / alignment issue"]]) {
      const option = document.createElement("option"); option.value = value; option.textContent = text; select.append(option);
    }
    try { select.value = JSON.parse(localStorage.getItem(STORAGE) ?? "{}")[p.referenceId]?.status ?? ""; } catch {}
    const saved = document.createElement("p"); saved.textContent = "Saved on this browser. Export notes to share with the team.";
    select.addEventListener("change", () => {
      try {
        const reviews = JSON.parse(localStorage.getItem(STORAGE) ?? "{}");
        if (select.value) reviews[p.referenceId] = { status: select.value, reviewedAt: new Date().toISOString(), referenceId: p.referenceId, pilot: "antakya-2023" };
        else delete reviews[p.referenceId];
        localStorage.setItem(STORAGE, JSON.stringify(reviews));
        saved.textContent = "Local note saved; no field confirmation or dispatch was created.";
      } catch { saved.textContent = "Browser storage unavailable; this note was not saved."; }
    });
    label.append(select); el.append(title, detail, label, saved); layer.bindPopup(el, { maxWidth: 320 });
  }
  return <GeoJSON data={data} pane="overlayPane" style={{ className: "building-reference stroke-primary fill-primary", weight: 1.5, fillOpacity: 0.12 }}
    attribution="© OpenStreetMap contributors / HOT, ODbL 1.0" onEachFeature={popup} />;
}

export function ExportBuildingReviews() {
  return <button type="button" className="mt-2 text-xs text-primary underline" onClick={() => {
    let reviews = {};
    try { reviews = JSON.parse(localStorage.getItem(STORAGE) ?? "{}"); } catch {}
    const blob = new Blob([JSON.stringify({ pilot: "antakya-2023", exportedAt: new Date().toISOString(), scope: "Local human notes; not field-validated damage or model output", reviews }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = "antakya-building-reviews.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }}>Export local building review notes</button>;
}

export function RadiancePairs() {
  const [data, setData] = useState<FeatureCollection | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/nasa-atlas/radiance-pairs.geojson", { signal: controller.signal })
      .then(r => r.ok ? r.json() : null).then(setData).catch(() => {});
    return () => controller.abort();
  }, []);
  if (!data) return null;
  return <GeoJSON data={data} style={{ className: "stroke-ink fill-none", weight: 0.5 }} onEachFeature={(feature, layer) => {
    const p = feature.properties!;
    const el = document.createElement("p");
    el.textContent = `Black Marble · ~500 m pixel. ${p.beforeDate}: ${p.before} → ${p.afterDate}: ${p.after} nW/(cm² sr). Change: ${p.changePct}%. Both observations passed the conservative QA filter. Regional light change does not establish building damage or people trapped.`;
    layer.bindPopup(el);
  }} />;
}
