"use client";
// Layout copied from the USGS Latest Earthquakes map: list on the left, gray basemap on the
// right, one marker per event sized by how many people reported it, the selected one
// highlighted in both places, a legend on the map, "only list what is in the map area".
// Colours are ours (encode.ts): tier is the fill, confidence is the outline, stale fades.
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef, useState } from "react";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import type { Incident, LatLng, Site } from "@/lib/types";
import validation from "../../data/nasa/validation.json";
import { IncidentCards, SiteCards } from "../BoardCards";
import { Stamp } from "../Stamp";
import { chip, pill, statusTag, statusText, tierBadge, tierBar, tierText } from "../encode";
import type { MapItem } from "./mapItems";
import { icon, TILES, TILES_ATTR } from "./markers";
import { HatchDefs, useZones, ZoneLayer, type ZoneMeta } from "./ZoneLayer";
import { NasaEvidence } from "./NasaEvidence";
import { NasaAtlasControls, NasaAtlasOverlay, useNasaAtlas, type AtlasSelection } from "./NasaAtlas";

// The NASA check: one ink ring on the Yeni Cami landmark. JSON stores [lng, lat].
const CHECK_AT: LatLng = [validation.landmark.coordsLngLat[1], validation.landmark.coordsLngLat[0]];
const CHECK_PCT = Math.round(validation.landmark500mEvidence.damage.flaggedOverlayFraction * 100);
const checkRing = () => L.divIcon({
  className: "",
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  html: `<span class="block h-full w-full rounded-full border-2 border-solid border-ink"></span>`,
});

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

function FlyTo({ to, zoom }: { to?: LatLng; zoom?: number }) {
  const map = useMap();
  useEffect(() => {
    if (to) map.flyTo(to, zoom ?? Math.max(map.getZoom(), 15), { duration: 0.4 });
  }, [map, to, zoom]);
  return null;
}

function FitCity({ bounds }: { bounds?: [LatLng, LatLng] }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) map.flyToBounds(bounds, { padding: [24, 24], maxZoom: 13, duration: 0.4 });
  }, [map, bounds]);
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
    <li className={`border-b border-line ${selected ? "bg-primary-lighter" : "bg-card"}`}>
      <button onClick={onPick} className="flex w-full items-start gap-3 p-3 text-left hover:bg-primary-lighter">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`rounded-tag px-1.5 text-xs font-bold ${tierBadge(it.tier, it.actNow)}`}>
              <span className="font-mono">{tierText(it.tier).code}</span> {tierText(it.tier).word}
            </span>
            <span className="font-mono text-xs text-muted">{it.kind} {it.key.slice(it.kind.length + 1)}</span>
          </span>
          <span className="mt-1 block truncate font-bold text-ink first-letter:uppercase">{it.title}</span>
          <span className="block">
            <Stamp type={it.staleType} at={it.at} source={it.source} sources={it.sources} now={now} />
          </span>
          {it.note && <span className="block text-xs text-muted">{it.note}</span>}
          {it.placedAt && <span className="block text-xs text-muted">No position of its own. Shown at {it.placedAt}</span>}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className={statusTag}>{statusText(it.status)}</span>
          {it.priority !== undefined && <span className="text-xs text-muted">Priority <span className="font-mono">{it.priority}</span></span>}
          {site && <span className="text-xs text-muted"><span className="font-mono">{site.peopleTrapped}</span> trapped</span>}
        </span>
      </button>
      {selected && (it.kind === "site" || it.kind === "incident") && (
        <div className="px-3 pb-3">
          {it.kind === "site" && <SiteCards items={[it.record as Site]} now={now} />}
          {it.kind === "incident" && <IncidentCards items={[it.record as Incident]} now={now} />}
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
      <p><Swatch fill="fill-[url(#nasa-hatch)]" /> Cold exposure, POWER, {day(d?.temperatureDate)}</p>
      <p><Swatch fill="fill-[url(#nasa-cross)]" /> Silent-zone signal, when supported</p>
      <p><Swatch dashed /> Satellite assessment needs more evidence</p>
      <p className="mt-1 max-w-64 text-muted">
        Damage: ARIA Sentinel-1, {day(d?.damageDate)}, {km(r?.damage)}. Night lights: Black Marble, {day(d?.lightsAfterDate)}, {km(r?.nightLights)}.
        Weather: {km(r?.temperatureApprox)} grid. Click a demo cell for its evidence.
      </p>
    </div>
  );
}

function Legend({ meta, zones }: { meta?: ZoneMeta; zones: boolean }) {
  const dot = "inline-block h-3.5 w-3.5 rounded-full align-middle";
  // Below md the legend sits behind a button. At md and up it is always open.
  const [open, setOpen] = useState(false);
  return (
    <>
      {!open && (
        <button type="button" onClick={() => setOpen(true)} aria-expanded={false}
          className={`${chip(false)} pointer-events-auto absolute bottom-6 left-3 z-[1000] md:hidden`}>
          Legend
        </button>
      )}
    <div className={`pointer-events-auto absolute bottom-6 left-3 z-[1000] max-h-[calc(100%-3rem)] overflow-y-auto rounded-card border border-line bg-card p-3 text-xs md:block md:max-w-80 ${open ? "block" : "hidden"}`}>
      <div className="mb-1 flex items-center justify-between gap-3">
        <p className="font-bold">Legend</p>
        <button type="button" onClick={() => setOpen(false)} className={`${chip(false)} md:hidden`}>Close</button>
      </div>
      <div className="flex flex-wrap gap-1">
        <span className={pill}><span className={`${dot} ${tierBar(0)}`} /> Danger to life</span>
        <span className={pill}><span className={`${dot} ${tierBar(1)}`} /> Urgent</span>
        <span className={pill}><span className={`${dot} ${tierBar(2)}`} /> Comfort</span>
        <span className={pill}><span className={`inline-block h-3 w-3 rotate-45 rounded-tag align-middle ${tierBar(2)}`} /> Problem in the field</span>
        <span className={pill}><span className={`inline-block h-3 w-3 rounded-tag align-middle ${tierBar(1)}`} /> Shelter, full or over 90% of beds</span>
        <span className={pill}><span className={`inline-block h-3 w-3 rounded-tag align-middle ${tierBar(2)}`} /> Shelter with room</span>
        <span className={pill}><span className="inline-block h-2 w-5 border-4 border-solid border-ink bg-card align-middle" /> Road closed</span>
        <span className={pill}><span className="inline-block h-2 w-5 border-2 border-dashed border-ink bg-card align-middle" /> Road unconfirmed</span>
        {zones && <span className={pill}><span className="inline-block h-3 w-3 rounded-full border-2 border-solid border-ink align-middle" /> Independent check, {validation.landmark.name} (DHA)</span>}
      </div>
      <p className="mt-1">Bigger means more people reported it.</p>
      <p>Dashed outline: unconfirmed. Thick: confirmed.</p>
      <p>Faded: the number is stale.</p>
      {zones && <NasaLegend meta={meta} />}
    </div>
    </>
  );
}

export default function DeskMapView({ items, now, live, zonesUrl, focus }: {
  items: MapItem[]; now: number; live: boolean; zonesUrl?: string;
  focus?: string;                 // "<kind>:<id>" from /map?focus=, selected and flown to on load
}) {
  const zones = useZones(zonesUrl ?? "");
  const atlas = useNasaAtlas();
  const [atlasSelection, setAtlasSelection] = useState<AtlasSelection>({ frameId: "hls-after-2023-02-09", showLimits: false, eventScope: "off", showDemoCells: false });
  const [atlasTarget, setAtlasTarget] = useState<LatLng>();
  const [cityBounds, setCityBounds] = useState<[LatLng, LatLng]>();
  const [selected, setSelected] = useState<string | null>(focus ?? null);
  const [flyTarget, setFlyTarget] = useState<LatLng | undefined>();
  const focused = useRef(false);
  const focusAt = items.find((i) => i.key === focus)?.coords;
  // Fly once, as soon as the focused item has a position (the live board may answer after the fixtures).
  useEffect(() => {
    if (focused.current || !focusAt) return;
    focused.current = true;
    setFlyTarget([...focusAt] as LatLng);
  }, [focusAt]);
  const [bounds, setBounds] = useState<L.LatLngBounds | null>(null);
  const [onlyInView, setOnlyInView] = useState(false);

  const placed = items.filter((i) => i.coords);
  const unplaced = items.filter((i) => !i.coords);
  const isExtra = (i: MapItem) => i.kind === "shelter" || i.kind === "road";
  const points = placed.map((i) => i.coords!);
  const cityPoints: [LatLng, LatLng] | undefined = atlas ? [[atlas.bbox[1], atlas.bbox[0]], [atlas.bbox[3], atlas.bbox[2]]] : undefined;
  const listed = onlyInView && bounds ? placed.filter((i) => bounds.contains(i.coords!)) : placed;
  const listedMain = listed.filter((i) => !isExtra(i));
  const listedExtra = listed.filter(isExtra);

  function pick(it: MapItem) {
    setSelected((cur) => (cur === it.key ? null : it.key));
    if (it.coords) setFlyTarget([...it.coords] as LatLng);
  }

  return (
    <div className="flex h-full flex-col md:flex-row">
      <aside className="order-2 flex min-h-0 flex-1 flex-col border-line bg-paper md:order-1 md:w-96 md:flex-none md:border-r">
        <header className="border-b border-line bg-card p-3">
          <h1 className="text-lg font-bold">Sites and problems</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span className={pill}><span className="font-mono">{listed.length}</span> of <span className="font-mono">{placed.length}</span> on the map{onlyInView ? " in this area" : ""}</span>
            <span className={pill}>{live ? "Live from the desk" : "Demo data, the board API is not answering"}</span>
          </p>
          <button type="button" aria-pressed={onlyInView} onClick={() => setOnlyInView((v) => !v)} className={`${chip(onlyInView)} mt-2`}>
            Only list what is in the map area
          </button>
        </header>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {listedMain.map((it) => (
            <Row key={it.key} it={it} selected={selected === it.key} onPick={() => pick(it)} now={now} />
          ))}
          {listedExtra.length > 0 && (
            <>
              <li className="px-3 pb-1 pt-4 text-sm font-bold">Shelters and roads (<span className="font-mono">{listedExtra.length}</span>)</li>
              {listedExtra.map((it) => (
                <Row key={it.key} it={it} selected={selected === it.key} onPick={() => pick(it)} now={now} />
              ))}
            </>
          )}
          {unplaced.length > 0 && (
            <>
              <li className="px-3 pb-1 pt-4 text-sm font-bold">No location yet (<span className="font-mono">{unplaced.length}</span>)</li>
              {unplaced.map((it) => (
                <Row key={it.key} it={it} selected={selected === it.key} onPick={() => pick(it)} now={now} />
              ))}
            </>
          )}
        </ul>
      </aside>

      <div className="relative order-1 h-[55vh] md:order-2 md:h-auto md:flex-1">
        <MapContainer center={[38.35, 38.31]} zoom={13} className="h-full w-full" zoomControl>
          <TileLayer url={TILES} attribution={`${TILES_ATTR}${zones?.metadata?.attribution ? `. Zones: ${zones.metadata.attribution}` : ""}${atlas ? ". Atlas: NASA GIBS, MODIS, GPM IMERG, NASA/USGS/ESA HLS, NASA EONET" : ""}`} maxZoom={16} />
          <KeepSized />
          {atlas && <NasaAtlasOverlay atlas={atlas} selection={atlasSelection} />}
          {zones && atlasSelection.showDemoCells && <ZoneLayer fc={zones} />}
          <FitOnce key={cityPoints && !focus ? "city" : "records"} points={cityPoints && !focus ? cityPoints : points} />
          <FitCity bounds={cityBounds} />
          <FlyTo to={flyTarget} />
          <FlyTo to={atlasTarget} zoom={10} />
          <TrackBounds onChange={setBounds} />
          {placed.filter((i) => i.linkTo).map((i) => (
            <Polyline key={`link:${i.key}`} positions={[i.coords!, i.linkTo!]}
              pathOptions={{ className: "stroke-muted", dashArray: "4 6", weight: 2 }} />
          ))}
          {atlasSelection.showDemoCells && <Marker position={CHECK_AT} icon={checkRing()} interactive>
            <Tooltip>
              Independent check: {validation.landmark.name} collapsed, {day(validation.independentReport.publishedAt.slice(0, 10))} (DHA).
              ARIA overlay covers {CHECK_PCT}% of its 500 m cell.
            </Tooltip>
          </Marker>}
          {placed.map((it) => (
            <Marker key={it.key} position={it.coords!} icon={icon(it, selected === it.key, now)}
              zIndexOffset={selected === it.key ? 1000 : it.kind === "incident" ? 500 : isExtra(it) ? 250 : 0}
              title={it.title} eventHandlers={{ click: () => pick(it) }} />
          ))}
        </MapContainer>
        <HatchDefs />
        <Legend meta={zones?.metadata} zones={!!zones && atlasSelection.showDemoCells} />
        {zones && <NasaEvidence fc={zones}>
          {atlas && <NasaAtlasControls atlas={atlas} selection={atlasSelection} onChange={setAtlasSelection} onLocate={setAtlasTarget} onCityView={() => setCityBounds(cityPoints ? [...cityPoints] : undefined)} />}
        </NasaEvidence>}
      </div>
    </div>
  );
}
