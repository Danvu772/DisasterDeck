// Every field of a record, in plain labels. One map per record type, in the order the
// panel lists them. A field the map does not know (a future API) still shows, under its raw key.
import { ageText, maskPhone } from "../encode";
import type { AnyRecord, DetailKind } from "./locate";

export const TIER_WORD = ["Danger to life", "Urgent", "Comfort"] as const;

const COMMON = { deskId: "Desk", _id: "Id" };

export const FIELDS: Record<DetailKind, Record<string, string>> = {
  site: {
    address: "Address", region: "Region", coords: "Position", peopleTrapped: "People trapped",
    callStatus: "Call status", status: "Status", hazard: "Hazard", tier: "Tier", priority: "Priority",
    confidence: "Confidence", support: "Different people reporting", observedAt: "Observed", ...COMMON,
  },
  need: {
    item: "Item", quantity: "Quantity", region: "Region", status: "Status", lifeThreatening: "Danger to life",
    siteIds: "Sites", lines: "Who gets how many", tier: "Tier", priority: "Priority", confidence: "Confidence",
    support: "Different people asking", requestedBy: "Asked by", ...COMMON,
  },
  shelter: {
    name: "Name", region: "Region", coords: "Position", bedsUsed: "Beds used", bedsTotal: "Beds total",
    observedAt: "Observed", updated: "Received", ...COMMON,
  },
  road: {
    road: "Road", state: "State", reason: "Reason", coords: "Position", confidence: "Confidence",
    observedAt: "Observed", ...COMMON,
  },
  incident: {
    kind: "Problem", severity: "Severity", status: "Status", canContinue: "Can still finish the task",
    textEn: "What they said, in English", text: "What they said", reportedBy: "Reported by", taskId: "Task",
    coords: "Position", ...COMMON,
  },
  task: {
    title: "Title", detail: "Detail", type: "Type", status: "Status", open: "Open", assignee: "Owner",
    tried: "Already asked", risk: "Risk", tier: "Tier", priority: "Priority", deadline: "Answer by",
    eta: "Promised finish", recordType: "About a", recordId: "Record", blockedBy: "Blocked by",
    replaces: "Replaces", ...COMMON,
  },
};

// Shown in their own sections below the list.
const OWN_SECTION = new Set(["history", "sources", "actions"]);

// Ids are shown but muted: they are for people who debug, not for people who act.
const ID_KEYS = new Set(["_id", "deskId", "recordId", "taskId", "siteIds", "blockedBy", "replaces", "assignee", "reportedBy", "tried", "requestedBy"]);

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

// "14 min ago, 03:15" or "in 5 min, 03:35"
export function when(at: Date | string, now: number): string {
  const d = new Date(at);
  const clock = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const ahead = d.getTime() - now;
  if (ahead > 60000) {
    const m = Math.round(ahead / 60000);
    return `in ${m < 60 ? `${m} min` : `${Math.floor(m / 60)} h`}, ${clock}`;
  }
  return `${ageText(d, now)}, ${clock}`;
}

function text(key: string, v: unknown, now: number): string {
  if (v === null || v === undefined) return "None";
  if (/phone/i.test(key)) return maskPhone(String(v));
  if (v instanceof Date || (typeof v === "string" && ISO.test(v))) return when(v as string, now);
  if (key === "tier" && typeof v === "number") return TIER_WORD[v] ?? String(v);
  if (key === "coords" && Array.isArray(v)) return v.map((n) => Number(n).toFixed(5)).join(", ");
  if (key === "lines" && Array.isArray(v)) {
    return v.map((l: { siteId?: string; quantity: number }) => (l.siteId ? `${l.quantity} for ${l.siteId}` : `${l.quantity}, no site yet`)).join(", ") || "None";
  }
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string") return ID_KEYS.has(key) ? v : v.replaceAll("_", " ");
  if (Array.isArray(v)) return v.length ? v.map((x) => text(key, x, now)).join(", ") : "None";
  if (typeof v === "object") {
    return Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k} ${text(k, x, now)}`).join(", ");
  }
  return String(v);
}

export interface Field { key: string; label: string; value: string; muted: boolean }

export function fields(kind: DetailKind, r: AnyRecord, now: number): Field[] {
  const labels = FIELDS[kind];
  const rec = r as unknown as Record<string, unknown>;
  const known = Object.keys(labels).filter((k) => k in rec);
  const extra = Object.keys(rec).filter((k) => !(k in labels) && !OWN_SECTION.has(k));
  return [...known, ...extra].map((k) => ({
    key: k, label: labels[k] ?? k, value: text(k, rec[k], now), muted: ID_KEYS.has(k),
  }));
}
