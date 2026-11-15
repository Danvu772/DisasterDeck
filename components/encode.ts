// The encoding table from "Frontend visual language", as code.
// Components ask this file how something looks. They never pick a colour themselves.
import type { Confidence, RecordType, Tier } from "@/lib/types";

// Tier → the left bar. Act-now overrides everything and is the only red.
export function tierBar(tier: Tier, actNow = false): string {
  if (actNow || tier === 0) return "bg-act";
  if (tier === 1) return "bg-urgent";
  return "bg-calm";
}

// Confidence → border line style. Never colour.
export function confidenceBorder(c: Confidence): string {
  if (c === "confirmed") return "border-2 border-solid border-ink";
  if (c === "corroborated") return "border border-solid border-ink/60";
  return "border border-dashed border-muted";
}

// Age, always from observedAt. DECIDE the thresholds (minutes).
export const STALE_AFTER_MIN: Record<RecordType, number> = {
  site: 60,
  need: 60,
  road: 30,
  shelter: 30,
  zone: 24 * 60,
  incident: 15,
};

export function minutesSince(at: Date | string, now: number): number {
  return Math.max(0, Math.round((now - new Date(at).getTime()) / 60000));
}

export function isStale(type: RecordType, at: Date | string, now: number): boolean {
  return minutesSince(at, now) > STALE_AFTER_MIN[type];
}

export function ageText(at: Date | string, now: number): string {
  const m = minutesSince(at, now);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.floor(h / 24)} d ago`;
}

// Stale ink: faded, and the word "stale" next to it (see Stamp).
export function staleInk(stale: boolean): string {
  return stale ? "opacity-50" : "";
}

// Phone numbers: masked everywhere except the caller's own task.
export function maskPhone(phoneMasked?: string): string {
  return phoneMasked ? `•••• •• ${phoneMasked.slice(-2)}` : "no phone";
}
