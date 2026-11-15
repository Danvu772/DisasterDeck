"use client";
// Layout copied from the USGS Latest Earthquakes map: list on the left, gray basemap on the
// right, one marker per event sized by how many people reported it, the selected one
// highlighted in both places, a legend on the map, "only list what is in the map area".
// Colours are ours (encode.ts): tier is the fill, confidence is the outline, stale fades.
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef, useState } from "react";
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { Incident, LatLng, Site } from "@/lib/types";
import { IncidentCards, SiteCards } from "../BoardCards";
import { Stamp } from "../Stamp";
import {
  confidenceBorder, isStale, markerSize, staleInk, statusTag, statusText, tierBadge, tierBar,
} from "../encode";
import type { MapItem } from "./mapItems";
import { HatchDefs, useZones, ZoneLayer, type ZoneMeta } from "./ZoneLayer";

// Esri World Light Gray Canvas, the USGS default basemap. Gray, so no hue competes with ours.
const TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}";
const TILES_ATTR = "Tiles &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors";

function icon(it: MapItem, selected: boolean, now: number): L.DivIcon {
  const s = markerSize(it.support);
  const fade = staleInk(isStale(it.staleType, it.at, now));
  const ring = selected ? "ring-4 ring-primary" : "";
  const shape = it.kind === "incident" ? "rotate-45 rounded-tag" : "rounded-full";
  return L.divIcon({
    className: "",
    iconSize: [s, s],
    iconAnchor: [s / 2, s / 2],
    html: `<span class="block ${shape} ${tierBar(it.tier, it.actNow)} ${confidenceBorder(it.confidence)} ${ring} ${fade}" style="width:${s}px;height:${s}px"></span>`,
  });
}

function FitOnce({ points }: { points: LatLng[] }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || points.length === 0) return;
    done.current = true;
    if (points.length === 1) map.setView(points[0], 15);
    else map.fitBounds(points, { padding: [40, 40], maxZoom: 16 });
  }, [map, points]);
  return null;
}

// Leaflet measures its box once. Re-measure whenever the layout moves it.
function KeepSized() {
  const map = useMap();
  useEffect(() => {
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map]);
  return null;
}

function FlyTo({ to }: { to?: LatLng }) {
  const map = useMap();
  useEffect(() => {
    if (to) map.flyTo(to, Math.max(map.getZoom(), 15), { duration: 0.4 });
  }, [map, to]);
  return null;
}

function TrackBounds({ onChange }: { onChange: (b: L.LatLngBounds) => void }) {
  const map = useMapEvents({ moveend: () => onChange(map.getBounds()) });
  useEffect(() => { onChange(map.getBounds()); }, [map, onChange]);
  return null;
}

function Row({ it, selected, onPick, now }: {
  it: MapItem; selected: boolean; onPick: () => void; now: number;
}) {
  const site = it.kind === "site" ? (it.record as Site) : undefined;
  return (
    <li className={`border-b border-line ${selected ? "bg-primary-lighter" : ""}`}>
      <button onClick={onPick} className="flex w-full items-start gap-3 p-3 text-left hover:bg-primary-lighter">
        {it.kind === "site" ? (
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-tag font-bold ${tierBadge(it.tier, it.actNow)}`}>
            {it.priority}
          </span>
        ) : (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center">
            <span className={`block h-6 w-6 rotate-45 rounded-tag ${tierBar(it.tier, it.actNow)}`} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold text-primary first-letter:uppercase">{it.title}</span>
          <span className="block">
            <Stamp type={it.staleType} at={it.at} source={it.source} sources={it.sources} now={now} />
          </span>
          {it.placedAt && <span className="block text-xs text-muted">No position of its own. Shown at {it.placedAt}</span>}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className={statusTag}>{statusText(it.status)}</span>
          {site && <span className="text-xs text-muted">{site.peopleTrapped} trapped</span>}
        </span>
      </button>
      {selected && (
        <div className="px-3 pb-3">
          {it.kind === "site"
            ? <SiteCards items={[it.record as Site]} now={now} />
            : <IncidentCards items={[it.record as Incident]} now={now} />}
        </div>
      )}
    </li>
  );
}

const day = (iso?: string) =>
  iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "";
const km = (m?: number) => (m === undefined ? "" : m >= 1000 ? `about ${m / 1000} km` : `about ${m} m`);

function Swatch({ fill, dashed }: { fill?: string; dashed?: boolean }) {
  return (
    <svg width="14" height="14" className="inline-block align-middle" aria-hidden>
      <rect x="1" y="1" width="12" height="12" className={`${fill ?? "fill-none"} stroke-hatch`} strokeWidth="2" strokeDasharray={dashed ? "3 2" : undefined} />
    </svg>
  );
}

function NasaLegend({ meta }: { meta?: ZoneMeta }) {
  const d = meta?.dates, r = meta?.nativeResolutionMeters;
  return (
    <div className="mt-2 border-t border-line pt-2">
      <p className="font-bold">NASA zones</p>
      <p><Swatch fill="fill-[url(#nasa-hatch)]" /> Cold night. POWER, {day(d?.temperatureDate)}, {km(r?.temperatureApprox)} grid</p>
      <p><Swatch fill="fill-[url(#nasa-cross)]" /> Silent zone: damage, power out, few calls</p>
      <p><Swatch dashed /> Silent zone not evaluated. Data could not say</p>
      <p className="mt-1 max-w-64 text-muted">
        Damage: ARIA Sentinel-1, {day(d?.damageDate)}, {km(r?.damage)}. Night lights: Black Marble, {day(d?.lightsAfterDate)}, {km(r?.nightLights)}.
        Satellite data only raises priority.
      </p>
    </div>
  );
}

function Legend({ meta, zones }: { meta?: ZoneMeta; zones: boolean }) {
  const dot = "inline-block h-3.5 w-3.5 rounded-full align-middle";
  return (
    <div className="pointer-events-auto absolute bottom-6 left-3 z-[1000] rounded-card border border-line bg-card p-3 text-xs">
      <p className="mb-1 font-bold">Legend</p>
      <p><span className={`${dot} ${tierBar(0)}`} /> Danger to life</p>
      <p><span className={`${dot} ${tierBar(1)}`} /> Urgent</p>
      <p><span className={`${dot} ${tierBar(2)}`} /> Comfort</p>
      <p className="mt-1"><span className={`inline-block h-3 w-3 rotate-45 rounded-tag align-middle ${tierBar(2)}`} /> Problem in the field</p>
      <p className="mt-1">Bigger means more people reported it.</p>
      <p>Dashed outline: unconfirmed. Thick: confirmed.</p>
      <p>Faded: the number is stale.</p>
      {zones && <NasaLegend meta={meta} />}
    </div>
  );
}

export default function DeskMapView({ items, now, live, zonesUrl }: {
  items: MapItem[]; now: number; live: boolean; zonesUrl?: string;
}) {
  const zones = useZones(zonesUrl ?? "");
  const [selected, setSelected] = useState<string | null>(null);
  const [flyTarget, setFlyTarget] = useState<LatLng | undefined>();
  const [bounds, setBounds] = useState<L.LatLngBounds | null>(null);
  const [onlyInView, setOnlyInView] = useState(false);

  const placed = items.filter((i) => i.coords);
  const unplaced = items.filter((i) => !i.coords);
  const points = placed.map((i) => i.coords!);
  const listed = onlyInView && bounds ? placed.filter((i) => bounds.contains(i.coords!)) : placed;

  function pick(it: MapItem) {
    setSelected((cur) => (cur === it.key ? null : it.key));
    if (it.coords) setFlyTarget([...it.coords] as LatLng);
  }

  return (
    <div className="flex h-full flex-col md:flex-row">
      <aside className="order-2 flex min-h-0 flex-1 flex-col border-line md:order-1 md:w-96 md:flex-none md:border-r">
        <header className="border-b border-line p-3">
          <h1 className="text-lg font-bold">Sites and problems</h1>
          <p className="text-sm text-muted">
            {listed.length} of {placed.length} on the map{onlyInView ? " in this area" : ""}.{" "}
            {live ? "Live from the desk." : "Demo data, the board API is not answering."}
          </p>
          <label className="mt-1 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyInView} onChange={(e) => setOnlyInView(e.target.checked)} />
            Only list what is in the map area
          </label>
        </header>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {listed.map((it) => (
            <Row key={it.key} it={it} selected={selected === it.key} onPick={() => pick(it)} now={now} />
          ))}
          {unplaced.length > 0 && (
            <>
              <li className="bg-paper px-3 pb-1 pt-4 text-sm font-bold">No location yet ({unplaced.length})</li>
              {unplaced.map((it) => (
                <Row key={it.key} it={it} selected={selected === it.key} onPick={() => pick(it)} now={now} />
              ))}
            </>
          )}
        </ul>
      </aside>

      <div className="relative order-1 h-[55vh] md:order-2 md:h-auto md:flex-1">
        <MapContainer center={[38.35, 38.31]} zoom={13} className="h-full w-full" zoomControl>
          <TileLayer url={TILES} attribution={zones?.metadata?.attribution ? `${TILES_ATTR}. Zones: ${zones.metadata.attribution}` : TILES_ATTR} maxZoom={16} />
          <KeepSized />
          {zones && <ZoneLayer fc={zones} />}
          <FitOnce points={points} />
          <FlyTo to={flyTarget} />
          <TrackBounds onChange={setBounds} />
          {placed.filter((i) => i.linkTo).map((i) => (
            <Polyline key={`link:${i.key}`} positions={[i.coords!, i.linkTo!]}
              pathOptions={{ className: "stroke-muted", dashArray: "4 6", weight: 2 }} />
          ))}
          {placed.map((it) => (
            <Marker key={it.key} position={it.coords!} icon={icon(it, selected === it.key, now)}
              zIndexOffset={selected === it.key ? 1000 : it.kind === "incident" ? 500 : 0}
              title={it.title} eventHandlers={{ click: () => pick(it) }} />
          ))}
        </MapContainer>
        <HatchDefs />
        <Legend meta={zones?.metadata} zones={!!zones} />
      </div>
    </div>
  );
}
