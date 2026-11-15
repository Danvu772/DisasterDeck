// What kind of record the ids in result.recordIds are. Null when the event type does not say.
import type { Event } from "@/lib/types";
import type { DetailKind } from "../detail/locate";

export type TouchedKind = DetailKind | "zone";

export function recordKind(e: Pick<Event, "type">): TouchedKind | null {
  switch (e.type) {
    case "report": return "site";
    case "need": return "need";
    case "closure": return "road";
    case "capacity": return "shelter";
    case "incident": return "incident";
    case "alert": return "zone";
    case "answer":
    case "approval": return "task";
    default: return null;
  }
}

// The board panel opens site, need, road, shelter, incident and task. Zones have no panel.
export function openHref(kind: TouchedKind | null, id: string): string | null {
  return kind && kind !== "zone" ? `/?open=${kind}:${id}` : null;
}
