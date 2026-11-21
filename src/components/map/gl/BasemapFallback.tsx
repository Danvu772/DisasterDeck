"use client";
// D-0006: when Esri tiles cannot load (blocked, down), swap the base raster source to OSM in place
// so the map keeps working. Rendered as a child of the MapGL component so useMap() sees the map.
import { useEffect, useRef } from "react";
import { useMap } from "react-map-gl/maplibre";
import { BASE_SOURCE, OSM_TILES } from "../basemaps";

/** The maplibre error event for a failed tile carries the source id. */
function sourceIdOf(e: unknown): string | undefined {
  const any = e as { sourceId?: string; error?: { sourceId?: string } };
  return any?.sourceId ?? any?.error?.sourceId;
}

export default function BasemapFallback() {
  const maps = useMap();
  const fellBack = useRef(false);

  useEffect(() => {
    const map = maps.current ?? maps.default;
    if (!map) return;
    const onError = (e: unknown) => {
      if (fellBack.current) return;
      if (sourceIdOf(e) !== BASE_SOURCE) return;
      const source = map.getMap().getSource(BASE_SOURCE) as { setTiles?: (tiles: string[]) => void } | undefined;
      if (source?.setTiles) {
        source.setTiles(OSM_TILES);
        fellBack.current = true;
        map.getMap().triggerRepaint();
      }
    };
    map.getMap().on("error", onError);
    return () => { map.getMap().off("error", onError); };
  }, [maps]);

  return null;
}
