// Plain labels for every payload field, one map per event type. Pure.
// A field that is not in the map shows under its raw key. enum: true turns "silent_zone" into "silent zone".
import type { EventType } from "@/lib/types";

export interface FieldLabel { label: string; enum?: true }

export const FIELDS: Record<EventType, Record<string, FieldLabel>> = {
  report: {
    kind: { label: "Kind", enum: true }, text: { label: "Original text" }, textEn: { label: "English text" },
    address: { label: "Address" }, coords: { label: "Coordinates" }, region: { label: "Region" },
    peopleCount: { label: "People" }, phoneMasked: { label: "Phone" }, siteId: { label: "Site" },
  },
  need: {
    item: { label: "Item" }, quantity: { label: "Quantity" }, lifeThreatening: { label: "Life-threatening" },
    siteId: { label: "Site" }, region: { label: "Region" }, coords: { label: "Coordinates" },
  },
  closure: {
    road: { label: "Road" }, state: { label: "State" }, reason: { label: "Reason" }, coords: { label: "Coordinates" },
  },
  capacity: {
    shelter: { label: "Shelter" }, bedsUsed: { label: "Beds used" }, bedsTotal: { label: "Beds total" },
    photoUrl: { label: "Photo" },
  },
  answer: {
    taskId: { label: "Task" }, result: { label: "Answer" }, note: { label: "Note" }, etaMinutes: { label: "ETA in minutes" },
  },
  approval: { taskId: { label: "Task" }, approved: { label: "Approved" } },
  alert: { zoneId: { label: "Zone" }, kind: { label: "Kind", enum: true }, evidence: { label: "Evidence" } },
  incident: {
    incidentId: { label: "Incident" }, kind: { label: "Kind", enum: true }, text: { label: "Original text" },
    textEn: { label: "English text" }, taskId: { label: "Task" }, canContinue: { label: "Can still finish the task" },
    coords: { label: "Coordinates" }, canDeliver: { label: "Can still deliver" }, resolved: { label: "Resolved" },
  },
  claim: {
    what: { label: "Doing", enum: true }, text: { label: "Original text" }, textEn: { label: "English text" },
    recordId: { label: "Record" }, etaMinutes: { label: "ETA in minutes" },
  },
  correction: {
    action: { label: "Action", enum: true }, recordType: { label: "Record type" }, recordId: { label: "Record" },
    otherRecordId: { label: "Other record" }, eventIds: { label: "Events" }, fields: { label: "New values" },
    reason: { label: "Reason" },
  },
  plan: { zoneExits: { label: "Exits by zone" }, reason: { label: "Reason" } },
};

function show(v: unknown, asEnum?: boolean): string {
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string") return asEnum ? v.replaceAll("_", " ") : v;
  if (Array.isArray(v)) {
    if (v.length === 2 && v.every((n) => typeof n === "number")) return `${v[0]}, ${v[1]}`;
    return v.map((x) => show(x)).join(", ");
  }
  if (v && typeof v === "object") {
    return Object.entries(v).filter(([, x]) => x !== undefined && x !== null)
      .map(([k, x]) => `${k} ${show(x)}`).join(", ");
  }
  return String(v);
}

export interface FieldRow { key: string; label: string; value: string }

// Known fields first in map order, then unknown ones under their raw key. Empty values are skipped.
export function fieldRows(type: EventType, payload: unknown): FieldRow[] {
  const p = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const map = FIELDS[type] ?? {};
  const has = (k: string) => p[k] !== undefined && p[k] !== null && p[k] !== "";
  const known = Object.keys(map).filter(has).map((k) => ({ key: k, label: map[k].label, value: show(p[k], map[k].enum) }));
  const unknown = Object.keys(p).filter((k) => !(k in map) && has(k)).map((k) => ({ key: k, label: k, value: show(p[k]) }));
  return [...known, ...unknown];
}
