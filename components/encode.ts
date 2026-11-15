// The encoding table from "Frontend visual language", as code.
// Components ask this file how something looks. They never pick a colour themselves.
import type { Confidence, RecordType, Tier } from "@/lib/types";

// Tier → the left bar. Act-now overrides everything and is the only red.
export function tierBar(tier: Tier, actNow = false): string {
  if (actNow || tier === 0) return "bg-act";
  if (tier === 1) return "bg-urgent";
  return "bg-calm";
}

// Incident severity → tier, so incidents use the same bar and pin colours as everything else.
export function severityTier(s: "low" | "high" | "critical"): Tier {
  return s === "critical" ? 0 : s === "high" ? 1 : 2;
}

// A filled square with the priority number in it (the magnitude box on the USGS list).
export function tierBadge(tier: Tier, actNow = false): string {
  return `${tierBar(tier, actNow)} ${actNow || tier === 0 ? "text-card" : "text-ink"}`;
}

// Map marker size from support (different reporters), like magnitude on the USGS map.
export function markerSize(support: number): number {
  return Math.min(30, 14 + Math.round(4 * Math.log2(Math.max(1, support))));
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

// Status → a USWDS tag. Neutral gray, uppercase, never coloured. Underscores read as spaces.
export const statusTag = "whitespace-nowrap rounded-tag bg-muted px-2 font-sans text-xs uppercase text-card";
export function statusText(s: string): string {
  return s.replaceAll("_", " ");
}

// Interactive → USWDS buttons. Primary = the one expected action, outline = the others.
// Problem keeps act red: it is the only button that means "someone needs help now".
export const button = {
  primary: "rounded-button bg-primary px-3 py-1.5 text-sm font-bold text-card hover:bg-primary-dark",
  outline: "rounded-button px-3 py-1.5 text-sm font-bold text-primary shadow-[inset_0_0_0_2px_var(--color-primary)] hover:text-primary-dark hover:shadow-[inset_0_0_0_2px_var(--color-primary-dark)]",
  act: "rounded-button bg-act px-3 py-1.5 text-sm font-bold text-card",
};

// Links → USWDS link: primary, underlined.
export const link = "text-primary underline hover:text-primary-dark";

// Stale ink: faded, and the word "stale" next to it (see Stamp).
export function staleInk(stale: boolean): string {
  return stale ? "opacity-50" : "";
}

// Phone numbers: masked everywhere except the caller's own task.
export function maskPhone(phoneMasked?: string): string {
  return phoneMasked ? `•••• •• ${phoneMasked.slice(-2)}` : "no phone";
}
