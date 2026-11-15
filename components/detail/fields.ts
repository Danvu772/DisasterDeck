// Human words for records: kind, status, trust, who did it. Pure, no JSX, safe in server components.
// `fields()` is kept for callers that want a plain list, but it only returns what a person cares about.
import { ClipboardList, Satellite, Users } from "lucide-react";
import type { ComponentType } from "react";
import { KDanger, KPackage, KRoadblock, KTent } from "../icons/koboyo";
import { users } from "@/fixtures/desk";
import type { Confidence } from "@/lib/types";
import { ageText } from "../encode";
import type { AnyRecord, DetailKind } from "./locate";

export const TIER_WORD = ["Life-threatening", "Urgent", "Can wait"] as const;

export const KIND_WORD: Record<DetailKind, string> = {
  site: "Site", need: "Need", shelter: "Shelter", road: "Road", incident: "Field problem", task: "Task",
};

// One icon per record kind (Koboyo, see icons/koboyo.tsx). The default only: with the record at hand,
// KindIcon asks icons/things.ts thingIcon() first, so a fire site shows the fire, like its map marker.
// A site with no danger shows people, as on the map list. "zone" is here so RecordCard can take any RecordType.
export const KIND_ICON: Record<DetailKind | "zone", ComponentType<{ className?: string }>> = {
  site: Users, need: KPackage, shelter: KTent, road: KRoadblock, incident: KDanger, task: ClipboardList,
  zone: Satellite,
};

// Every status the API sends, as a person would say it. Unknown ones lose their underscores.
const STATUS_WORD: Record<string, string> = {
  open: "Open", team_on_site: "Team on site", closed: "Closed", retracted: "Retracted",
  proposed: "Waiting for more requests", assigned: "Assigned", on_the_way: "On the way", delivered: "Delivered",
  cancelled: "Cancelled", unconfirmed: "Unconfirmed", helping: "Help on the way", escalated: "Escalated",
  resolved: "Resolved", created: "New", waiting_approval: "Needs approval", accepted: "Accepted",
  blocked: "Blocked", done: "Done", declined: "Declined", timed_out: "No answer",
  problem_reported: "Problem reported", pending: "Waiting", working: "Processing", merged: "Merged",
  rejected: "Not used", failed: "Needs a person", en_route: "On the way", arrived: "Arrived",
};

export function statusWord(s: string): string {
  const w = STATUS_WORD[s] ?? s.replaceAll("_", " ");
  return w.charAt(0).toUpperCase() + w.slice(1);
}

export const CALL_WORD: Record<string, string> = {
  not_called: "Not called yet", called: "Called", verified: "Verified by phone",
};

// "Confirmed", "Reported by 3 people", "Unconfirmed".
export function trustWord(c: Confidence | string, support?: number): string {
  if (c === "confirmed") return "Confirmed";
  if (support && support > 1) return `Reported by ${support} people`;
  return c === "corroborated" ? "Corroborated" : "Unconfirmed";
}

const ACTOR_WORD: Record<string, string> = { "synthetic-news": "News", "synthetic-sheet": "Shelter sheet", "synthetic-feed": "Social post" };
const ACRONYM: Record<string, string> = { x: "X", ig: "Instagram", nasa: "NASA", fb: "Facebook", usgs: "USGS" };

// A person's name for an id ("volunteer-callback" → "Zeynep"), or the id made readable ("memory-keeper" → "Memory keeper").
export function actorLabel(by: string): string {
  const u = users.find((x) => x._id === by);
  if (u) return u.name;
  if (ACTOR_WORD[by]) return ACTOR_WORD[by];
  if (!/^[a-z0-9]+([-_][a-z0-9]+)*$/.test(by)) return by;
  const [first, ...rest] = by.split(/[-_]/);
  const head = ACRONYM[first] ?? first.charAt(0).toUpperCase() + first.slice(1);
  return [head, ...rest].join(" ");
}

/** Task text for people: the dispatcher keeps the team's id in "Proposed team: Name (id)", the screen does not show it.
 *  A task proposed twice can carry the sentence twice; only the last one is shown. */
export function plainDetail(detail: string): string {
  const text = detail.replace(/(Proposed team: [^()]*?) \([^()]+\)/g, "$1");
  const proposals = text.match(/Proposed team: [^.]*(?:\.\d[^.]*)*\./g) ?? [];
  if (proposals.length < 2) return text;
  const rest = text.replace(/\s*Proposed team: [^.]*(?:\.\d[^.]*)*\./g, "").trim();
  return `${rest} ${proposals.at(-1)}`.trim();
}

// A database id (24 hex characters) or a fixture id ("task-12").
const RECORD_ID = String.raw`(?:[0-9a-f]{24}|[a-z]+-\d+)`;
const PERSON_ID = /\b(?:coordinator|volunteer|field|supplier|shelter|public)-[a-z0-9]+(?:-[a-z0-9]+)*\b/g;

/** One line of what the desk did about a problem, for people. The desk writes it with record ids
 *  ("task 6af9… blocked", "call task 6af9… sent to volunteer-callback"); the screen says "the task"
 *  and the person's name instead. `nameOf` finds a person's name; the fixture people stand in. */
export function plainStep(what: string, nameOf: (id: string) => string = actorLabel): string {
  const text = what
    .replace(new RegExp(String.raw`\b((?:call|deliver|rescue|assist) )?task ${RECORD_ID}\b`, "g"), (_, kind = "") => `the ${kind}task`)
    .replace(new RegExp(String.raw`\breplacement ${RECORD_ID}\b`, "g"), "a replacement")
    .replace(new RegExp(String.raw`\bincident ${RECORD_ID}\b`, "g"), "this problem")
    .replace(PERSON_ID, (id) => nameOf(id));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "Call about Turuncu Avlu, Turuncu Avlu" shows as "Call about Turuncu Avlu": old tasks repeat the place. */
export const taskTitle = (title: string) => title.replace(/^(.*?\s|)([^\s,][^,]*),\s*\2$/, "$1$2");

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// "14 min ago" or "in 5 min". Keeps the old two-part signature for callers.
export function when(at: Date | string, now: number): string {
  const d = new Date(at);
  const ahead = d.getTime() - now;
  if (ahead > 60000) {
    const m = Math.round(ahead / 60000);
    return `in ${m < 60 ? `${m} min` : `${Math.floor(m / 60)} h`}`;
  }
  return ageText(d, now);
}

// ---- The plain list. Ids, positions, region codes and scores never show. ----

export const FIELDS: Record<DetailKind, Record<string, string>> = {
  site: {
    address: "Address", peopleTrapped: "People trapped", callStatus: "Call", status: "Status", hazard: "Hazard",
    tier: "How bad", confidence: "Trust", support: "Different people reporting", observedAt: "Seen",
  },
  need: {
    item: "Item", quantity: "Quantity", status: "Status", lifeThreatening: "Danger to life", tier: "How bad",
    confidence: "Trust", support: "Different people asking",
  },
  shelter: { name: "Name", bedsUsed: "Beds used", bedsTotal: "Beds total", observedAt: "Seen" },
  road: { road: "Road", state: "State", reason: "Reason", confidence: "Trust", observedAt: "Seen" },
  incident: {
    kind: "Problem", severity: "Severity", status: "Status", canContinue: "Can still finish the task",
    textEn: "What they said",
  },
  task: {
    title: "Title", detail: "Detail", status: "Status", tier: "How bad", deadline: "Answer by", eta: "Promised finish",
  },
};

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function text(key: string, v: unknown, now: number): string {
  if (v === null || v === undefined) return "None";
  if (v instanceof Date || (typeof v === "string" && ISO.test(v))) return when(v as string, now);
  if (key === "tier" && typeof v === "number") return TIER_WORD[v] ?? "";
  if (key === "callStatus" && typeof v === "string") return CALL_WORD[v] ?? statusWord(v);
  if (key === "status" || key === "state") return statusWord(String(v));
  if (key === "confidence") return trustWord(String(v));
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string") return statusWord(v);
  return String(v);
}

export interface Field { key: string; label: string; value: string; muted: boolean }

export function fields(kind: DetailKind, r: AnyRecord, now: number): Field[] {
  const labels = FIELDS[kind];
  const rec = r as unknown as Record<string, unknown>;
  return Object.keys(labels)
    .filter((k) => rec[k] !== undefined && rec[k] !== null && rec[k] !== "")
    .map((k) => ({ key: k, label: labels[k], value: text(k, rec[k], now), muted: false }));
}
