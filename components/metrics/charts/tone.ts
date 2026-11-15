// Tone → token class. The one place a chart picks a colour. Red (act) is act-now only.
import type { MetricStatus, Tone } from "../types";

const BG: Record<Tone, string> = {
  act: "bg-destructive",
  warn: "bg-warning",
  calm: "bg-calm",
  ok: "bg-success",
  primary: "bg-primary",
  ink: "bg-foreground/80",
};

export function toneBg(tone: Tone = "ink"): string {
  return BG[tone];
}

// A metric's status as a word and a dot. Never a raw key on screen.
export const STATUS: Record<MetricStatus, { word: string; dot: string }> = {
  act: { word: "Act now", dot: "bg-destructive" },
  warn: { word: "Urgent", dot: "bg-warning" },
  ok: { word: "Healthy", dot: "bg-success" },
  unknown: { word: "Unknown", dot: "bg-calm" },
};
