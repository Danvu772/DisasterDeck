// Owned by Role 1. The help desk rules (Final system design §6). Pure.
// The memory keeper writes the incident with this severity. The dispatcher protects the
// mission first: a task the person cannot finish is blocked and a replacement goes out.
import type { Incident, IncidentKind } from "../types";

export function severity(kind: IncidentKind, canContinue: boolean, lifeThreatening: boolean): Incident["severity"] {
  if (kind === "injury" || kind === "unsafe") return "critical";
  if (!canContinue && lifeThreatening) return "critical";
  return canContinue ? "low" : "high";
}

/** Kinds that flag the place as a hazard for everyone sent there. */
export const HAZARD_KINDS: IncidentKind[] = ["unsafe", "injury"];
