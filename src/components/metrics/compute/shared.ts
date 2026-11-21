// Small pure helpers the metric files share. No React, no fetch, no lib/db.
// Every time here is scenario time in ms: `now` already went through deskNow() (components/clock.ts).
import type { HistoryEntry } from "@/lib/types";
import type { MetricId, MetricResult, MetricSource } from "../types";

// JSON boards carry dates as strings, fixtures carry Date objects. NaN when missing or bad.
export function ms(at: Date | string | undefined | null): number {
  return at ? new Date(at).getTime() : NaN;
}

export function minutesAgo(at: number, now: number): number {
  return Math.max(0, (now - at) / 60000);
}

// "just now", "4 min ago", "2 h ago", "3 d ago". Same words as encode.ts ageText, from scenario ms.
export function agoText(at: number, now: number): string {
  const m = Math.round(minutesAgo(at, now));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.floor(h / 24)} d ago`;
}

export function minText(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}

// Nearest-rank percentile (the NFPA 1710 fractile). p in 0..1. NaN on an empty list.
export function percentile(values: number[], p: number): number {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.max(0, Math.ceil(p * s.length) - 1)];
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((100 * part) / whole) : 0;
}

export function historyTimes(h: HistoryEntry[] | undefined): number[] {
  return (h ?? []).map((e) => ms(e.ts)).filter((t) => !Number.isNaN(t));
}

export function newest(times: number[]): number {
  return times.length ? Math.max(...times) : NaN;
}

export function oldest(times: number[]): number {
  return times.length ? Math.min(...times) : NaN;
}

// The result for a metric the data cannot back. The chat shows `unknownReason` as is.
export function unknown(id: MetricId, title: string, source: MetricSource, reason: string, basis: string, now: number): MetricResult {
  return {
    id, title, source, basis, computedAt: now, status: "unknown",
    headline: `Not known yet. ${reason}`,
    chart: { kind: "none" },
    unknownReason: reason,
  };
}
