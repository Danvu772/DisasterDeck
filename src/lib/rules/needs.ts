// Owned by Role 1. When one person's wish becomes shared work (Final system design §5 and §8.2).
// Pure: the memory keeper loads the needs, this decides, the keeper writes.
//   - Same item, and the same site or the same region, and not delivered or cancelled: one need.
//   - The same site asking again is the same line said again: keep the larger number.
//     Another site is a new line, and the lines travel together in one delivery.
//   - Open at once for a trusted asker or danger to life. Public: proposed until 3 people ask.
import type { Need, Tier, Trust } from "../types";
import { sameItem } from "./assign";

export const OPEN_AFTER = 3;

export function matchNeed(needs: Need[], item: string, region: string, siteId?: string): Need | undefined {
  return needs.find((n) =>
    n.status !== "delivered" && n.status !== "cancelled" && sameItem(n.item, item) &&
    ((siteId && n.siteIds.includes(siteId)) || n.region === region));
}

export function mergeLines(lines: Need["lines"], siteId: string | undefined, quantity: number): Need["lines"] {
  const i = lines.findIndex((l) => l.siteId === siteId);
  if (i < 0) return [...lines, { ...(siteId ? { siteId } : {}), quantity }];
  return lines.map((l, j) => (j === i ? { ...l, quantity: Math.max(l.quantity, quantity) } : l));
}

export function needStatus(current: Need["status"] | undefined, support: number, trusted: boolean, life: boolean): Need["status"] {
  if (current && current !== "proposed") return current;
  return trusted || life || support >= OPEN_AFTER ? "open" : "proposed";
}

export const isTrusted = (t: Trust) => t === "official" || t === "vetted";

/** §5 tier 2, comfort: hot meals, phone chargers and the like. Water, food, medicine, warmth stay urgent. */
const COMFORT = /\bhot (meal|food|drink)s?\b|\bburgers?\b|\bpizzas?\b|\bsnacks?\b|\bcoffee\b|\btea\b|\bchargers?\b|power ?banks?|\btoys?\b|\bbooks?\b|\bcigarettes?\b|sıcak yemek|sicak yemek|şarj|sarj|\bçay\b|\bkahve\b|oyuncak/i;
export const isComfortItem = (item: string) => COMFORT.test(item);

/** 0 danger to life, 2 comfort, 1 the rest. */
export function needTier(item: string, lifeThreatening: boolean): Tier {
  return lifeThreatening ? 0 : isComfortItem(item) ? 2 : 1;
}
