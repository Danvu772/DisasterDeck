"use client";
// The board's big map: the desk's MapLibre map (map/gl/DeskGlMap.tsx), same markers as /map.
// The selected record gets the selected ring and its card, clicking a marker selects it.
// MapLibre needs `window`: LiveBoard loads this with next/dynamic, ssr off.
import type { LatLng } from "@/lib/types";
import type { MapItem } from "../map/mapItems";
import DeskGlMap from "../map/gl/DeskGlMap";

export default function BoardMap({ items, now, ring, ringAt, fly, onPick }: {
  items: MapItem[]; now: number;
  ring?: string;          // the marker key that gets the selected ring
  ringAt?: LatLng;        // where the selection is, also when no marker has that key (an open road)
  fly?: string;           // set to the selected key to fly there. Unset for the automatic pick, so the first view stays the overview
  onPick: (key: string) => void;
}) {
  return (
    <DeskGlMap
      items={items}
      now={now}
      selected={ring}
      ringAt={ringAt}
      flyKey={fly}
      onPick={(key) => { if (key) onPick(key); }}
      initialLayers={{ quakes: false }}
      popup={false}
    />
  );
}
