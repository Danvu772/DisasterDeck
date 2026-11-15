// Owned by Role 1. The help desk rules (Final system design §6). Pure.
// The memory keeper writes the incident with this severity. The dispatcher protects the
// mission first: a task the person cannot finish is blocked and a replacement goes out.
// PLAYBOOK is the table of §6, one row per kind: the keeper and the dispatcher read it, so a
// kind is changed here and not in an if-branch.
import type { Incident, IncidentKind } from "../types";

export function severity(kind: IncidentKind, canContinue: boolean, lifeThreatening: boolean): Incident["severity"] {
  if (kind === "injury" || kind === "unsafe") return "critical";
  if (!canContinue && lifeThreatening) return "critical";
  return canContinue ? "low" : "high";
}

export interface Plan {
  /** Is the person's task blocked? "if_cannot_continue" follows the report's canContinue. */
  block: "always" | "if_cannot_continue" | "never";
  /** A blocked deliver task: the need goes back to open. */
  reopenNeed: boolean;
  /**
   * What replaces a blocked task. relay_or_fresh: for a deliver task, the closer of a relay (a
   * free vehicle picks the load up where it stopped) and a fresh delivery from another supplier.
   * next_person: the same task to the next person. none: nothing, other steps carry on.
   */
  replace: "relay_or_fresh" | "next_person" | "none";
  /** An assist task for the nearest free person with a mechanic skill or a vehicle. */
  assist: boolean;
  /** The reporter is busy until the incident is resolved (only when they cannot continue). */
  busy: boolean;
  /** Everyone whose task touches the same need, and the people who asked, hear the new ETA. */
  tellWaiting: boolean;
  /** The site is flagged as a hazard (the keeper), everyone with a task there gets a warning. */
  hazard: boolean;
  /** A medical or rescue task is proposed, high risk, a coordinator approves. */
  proposeHelp: boolean;
  /** An unconfirmed closure is recorded, through the same path as a closure event. */
  closure: boolean;
  /** The person's load continues, the rest of the need goes to the next supplier. */
  splitNeed: boolean;
  /** The site goes back to "not called": a volunteer verifies the address by phone. */
  verifySite: boolean;
  /** A coordinator is told: when no step finds someone ("no_replacement"), always, or on the second failure. */
  escalate: "no_replacement" | "always" | "second_time";
}

const base: Plan = {
  block: "if_cannot_continue", reopenNeed: true, replace: "next_person", assist: false, busy: false, tellWaiting: false,
  hazard: false, proposeHelp: false, closure: false, splitNeed: false, verifySite: false, escalate: "no_replacement",
};

export const PLAYBOOK: Record<IncidentKind, Plan> = {
  vehicle_breakdown: { ...base, replace: "relay_or_fresh", assist: true, busy: true, tellWaiting: true },
  unreachable: { ...base, replace: "relay_or_fresh", tellWaiting: true },
  road_blocked: { ...base, closure: true },
  cannot_find: { ...base, block: "always", replace: "none", verifySite: true, escalate: "second_time" },
  short_supply: { ...base, block: "never", reopenNeed: false, replace: "none", splitNeed: true },
  unsafe: { ...base, block: "always", replace: "none", hazard: true, proposeHelp: true, escalate: "always" },
  injury: { ...base, block: "always", replace: "none", busy: true, hazard: true, proposeHelp: true, escalate: "always" },
  handover: { ...base },
  other: { ...base, block: "never", reopenNeed: false, replace: "none", escalate: "always" },
};

/** Kinds that flag the place as a hazard for everyone sent there. */
export const HAZARD_KINDS = (Object.keys(PLAYBOOK) as IncidentKind[]).filter((k) => PLAYBOOK[k].hazard);

/** Does this report stop the task? */
export const blocks = (kind: IncidentKind, canContinue: boolean): boolean =>
  PLAYBOOK[kind].block === "always" || (PLAYBOOK[kind].block === "if_cannot_continue" && !canContinue);
