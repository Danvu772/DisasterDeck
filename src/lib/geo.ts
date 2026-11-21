// Owned by Role 1. Distance and text normalisation for the memory keeper's merge rules.
// Pure functions: no database, easy to test.
import type { LatLng } from "./types";

/** Straight-line distance in meters. LatLng is [lat, lng] (Team contracts §3). */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Turkish letters folded to ASCII, so "Sokağı" and "sokagi" compare equal.
const FOLD: Record<string, string> = { ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };
const fold = (s: string) => s.replace(/[çğıİöşüâîû]/gi, (ch) => FOLD[ch] ?? FOLD[ch.toLowerCase()] ?? ch);

// Common Turkish address words and their abbreviations, reduced to one form.
const ADDRESS_WORDS: [RegExp, string][] = [
  [/\b(mahallesi|mahalle|mah)\b/g, "mah"],
  [/\b(sokagi|sokak|sok|sk)\b/g, "sk"],
  [/\b(caddesi|cadde|cad|cd)\b/g, "cd"],
  [/\b(bulvari|bulvar|blv)\b/g, "blv"],
  [/\b(apartmani|apartman|apt)\b/g, "apt"],
  [/\b(numara|no)\b/g, "no"],
];

/** An address reduced to a comparable key, or null when nothing useful is left. */
export function normalizeAddress(address: string | undefined | null): string | null {
  if (!address) return null;
  let s = fold(address.toLocaleLowerCase("tr"));
  s = s.replace(/[^a-z0-9]+/g, " ");
  for (const [re, to] of ADDRESS_WORDS) s = s.replace(re, to);
  s = s.replace(/\s+/g, " ").trim();
  // "address unknown" and a lone number say nothing about a place.
  if (s.length < 4 || /^(address unknown|unknown|bilinmiyor)$/.test(s)) return null;
  return s;
}

/**
 * A post's text reduced to a key for "same text": case, punctuation, links, "RT @name:" and
 * extra spaces do not count. Two posts with the same key are copies of one voice.
 */
export function normalizeText(text: string | undefined | null): string | null {
  if (!text) return null;
  let s = text.replace(/^\s*rt\s+@\w+:?\s*/i, "").replace(/https?:\/\/\S+/g, " ");
  s = fold(s.toLocaleLowerCase("tr")).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  return s.length ? s : null;
}

/** Ray casting. `rings` is a GeoJSON Polygon: [outer, ...holes], each a ring of [lng, lat]. */
export function pointInPolygon(p: LatLng, rings: number[][][]): boolean {
  const inRing = (ring: number[][]) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > p[0] !== yj > p[0] && p[1] < ((xj - xi) * (p[0] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  return rings.length > 0 && inRing(rings[0]) && !rings.slice(1).some(inRing);
}
