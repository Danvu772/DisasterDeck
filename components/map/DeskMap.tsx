"use client";
// The map, fed by any endpoint that returns a Board (or anything an adapter turns into
// MapItem[]). Leaflet needs `window`, so the view loads in the browser only.
import dynamic from "next/dynamic";
import { fromBoard, type MapItem, type MapSource } from "./mapItems";
import { usePolled } from "./usePolled";

const DeskMapView = dynamic(() => import("./DeskMapView"), {
  ssr: false,
  loading: () => <p className="p-4 text-sm text-muted">Loading the map</p>,
});

export function DeskMap<T = MapSource>({ initial, url = "/api/board", zonesUrl = "/data/zones.geojson", adapt, focus }: {
  initial: T;
  focus?: string;                 // "<kind>:<id>", select and fly to it on load
  url?: string;
  zonesUrl?: string;              // any GeoJSON FeatureCollection of zones, "" for none
  adapt?: (data: T) => MapItem[];
}) {
  const { data, live, now } = usePolled<T>(url, initial);
  const items = adapt ? adapt(data) : fromBoard(data as MapSource);
  return <DeskMapView items={items} now={now} live={live} zonesUrl={zonesUrl} focus={focus} />;
}
