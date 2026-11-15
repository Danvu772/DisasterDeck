// Observed (when it was true) against received (when the desk got it). Pure.
import type { Event } from "@/lib/types";

const GAP_MIN = 5;

function span(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} h` : `${Math.round(h / 24)} d`;
}

// "Observed 2 h before the desk got it." Null when the two are within 5 minutes.
export function gapText(e: Pick<Event, "ts" | "observedAt">): string | null {
  if (!e.observedAt) return null;
  const min = Math.round((new Date(e.ts).getTime() - new Date(e.observedAt).getTime()) / 60000);
  return min > GAP_MIN ? `Observed ${span(min)} before the desk got it.` : null;
}

export function exactTime(at: Date | string): string {
  return new Date(at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export const LANE_TEXT: Record<0 | 1, string> = {
  0: "Lane 0, a person on the desk, read first",
  1: "Lane 1, an outside source",
};
