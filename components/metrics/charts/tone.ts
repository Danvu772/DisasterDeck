// Tone → token class. The one place a chart picks a colour. Red (act) is act-now only.
import type { Tone } from "../types";

const BG: Record<Tone, string> = {
  act: "bg-act",
  warn: "bg-urgent",
  calm: "bg-calm",
  ok: "bg-ok",
  primary: "bg-primary",
  ink: "bg-ink",
};

export function toneBg(tone: Tone = "ink"): string {
  return BG[tone];
}
