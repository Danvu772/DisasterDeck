// Calls for help per NASA zone, counted from the desk's sites. The silent-zone rule is
// "heavy damage + dark + few calls": with this, "few calls" is what the X and news agents
// actually found, not a number fixed in public/data/zones.geojson. Owner: Role 2.

import type { LatLng, Site } from "@/lib/types";

export interface ZoneShape {
  id: string;
  geometry?: { type: string; coordinates: unknown };
}

/** Ray casting. `ring` is GeoJSON order [lng, lat]; `point` is the desk's order [lat, lng]. */
export function inRing([lat, lng]: LatLng, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Distinct calls per zone id. A site counts its different reporters (`support`, so 400 retweets
 * of one tweet are one call), at least 1. Retracted sites and sites with no coordinates do not
 * count. Zones that are not a single polygon are left out of the result.
 */
export function callsByZone(zones: ZoneShape[], sites: Site[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const z of zones) {
    if (z.geometry?.type !== "Polygon") continue;
    const outer = (z.geometry.coordinates as number[][][])[0];
    out[z.id] = sites
      .filter((s) => s.status !== "retracted" && s.coords && inRing(s.coords, outer))
      .reduce((n, s) => n + Math.max(1, s.support ?? s.sources?.length ?? 1), 0);
  }
  return out;
}
