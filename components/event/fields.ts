// Plain labels for the payload fields a person cares about, one map per event type. Pure.
// Ids, coordinates, region codes and unknown keys never show. enum: true turns "silent_zone" into "Silent zone".
import type { EventType } from "@/lib/types";

export interface FieldLabel { label: string; enum?: true; hide?: true }
const HIDE = { label: "", hide: true } as const;

export const FIELDS: Record<EventType, Record<string, FieldLabel>> = {
  report: {
    kind: { label: "Kind", enum: true }, text: HIDE, textEn: HIDE,
    address: { label: "Address" }, coords: HIDE, region: HIDE,
    peopleCount: { label: "People" }, phoneMasked: HIDE, siteId: HIDE,
  },
  need: {
    item: { label: "Item" }, quantity: { label: "Quantity" }, lifeThreatening: { label: "Life-threatening" },
    siteId: HIDE, region: HIDE, coords: HIDE,
  },
  closure: {
    road: { label: "Road" }, state: { label: "State", enum: true }, reason: { label: "Reason" }, coords: HIDE,
  },
  capacity: {
    shelter: { label: "Shelter" }, bedsUsed: { label: "Beds used" }, bedsTotal: { label: "Beds total" },
    photoUrl: HIDE,
  },
  answer: {
    taskId: HIDE, result: { label: "Answer", enum: true }, note: { label: "Note" }, etaMinutes: { label: "Minutes to arrive" },
  },
  approval: { taskId: HIDE, approved: { label: "Approved" } },
  alert: { zoneId: HIDE, kind: { label: "Kind", enum: true }, evidence: HIDE },
  incident: {
    incidentId: HIDE, kind: { label: "Kind", enum: true }, text: HIDE,
    textEn: HIDE, taskId: HIDE, canContinue: { label: "Can still finish the task" },
    coords: HIDE, canDeliver: { label: "Can still deliver" }, resolved: { label: "Resolved" },
  },
  claim: {
    what: { label: "Doing", enum: true }, text: HIDE, textEn: HIDE,
    recordId: HIDE, etaMinutes: { label: "Minutes to arrive" },
  },
  correction: {
    action: { label: "Action", enum: true }, recordType: HIDE, recordId: HIDE,
    otherRecordId: HIDE, eventIds: HIDE, fields: HIDE,
    reason: { label: "Reason" },
  },
  plan: { zoneExits: HIDE, reason: { label: "Reason" } },
};

function show(v: unknown, asEnum?: boolean): string {
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string") {
    if (!asEnum) return v;
    const w = v.replaceAll("_", " ");
    return w.charAt(0).toUpperCase() + w.slice(1);
  }
  if (Array.isArray(v)) return v.map((x) => show(x)).join(", ");
  if (v && typeof v === "object") {
    return Object.entries(v).filter(([, x]) => x !== undefined && x !== null)
      .map(([k, x]) => `${k} ${show(x)}`).join(", ");
  }
  return String(v);
}

export interface FieldRow { key: string; label: string; value: string }

// Known, visible fields in map order. Empty values, hidden keys and keys the map does not know are skipped.
export function fieldRows(type: EventType, payload: unknown): FieldRow[] {
  const p = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const map = FIELDS[type] ?? {};
  const has = (k: string) => p[k] !== undefined && p[k] !== null && p[k] !== "";
  return Object.keys(map).filter((k) => !map[k].hide && has(k))
    .map((k) => ({ key: k, label: map[k].label, value: show(p[k], map[k].enum) }));
}
