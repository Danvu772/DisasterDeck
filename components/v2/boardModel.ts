// Pure adapters: a board (live API or fixture) in, what the v2 screens draw out.
// No fetching here, so any API with these collections plugs in.
import type { Board, Confidence, Event, Health, Incident, Need, Road, Shelter, Site, Task, Tier, Zone } from "@/lib/types";
import { users } from "@/fixtures/desk";
import type { ChipKind } from "./ui";

export type V2Board = Pick<Board, "sites" | "needs" | "roads" | "shelters" | "incidents" | "tasks"> & {
  zones?: Zone[];
  health: Partial<Health>;
};

export type RecordKind = "site" | "need" | "incident" | "shelter" | "road";

export interface Row {
  key: string;                 // "<kind>:<id>", also the map focus key
  kind: RecordKind;
  id: string;
  tier: Tier;
  score: number | null;        // the Brain's priority, null when the screen derived the order
  title: string;
  meta: string;
  chip: { kind: ChipKind; text: string };
  sortScore: number;
}

export interface Detail {
  key: string;
  kindLabel: string;
  id: string;
  tier: Tier;
  title: string;
  summary: string;
  conf: { label: string; pct: number; tone: "act" | "urgent" | "ok" | "calm"; note: string };
  why: string;
  facts: { label: string; value: string }[];
  history: { when: Date | string; who: string; what: string }[];
}

export function nameOf(id?: string): string {
  if (!id) return "nobody";
  return users.find((u) => u._id === id)?.name ?? id;
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

function minutesAgo(when: Date | string | null | undefined, now: number) {
  if (!when) return Infinity;
  return (now - new Date(when).getTime()) / 60000;
}

function age(when: Date | string | null | undefined, now: number) {
  const m = minutesAgo(when, now);
  if (!Number.isFinite(m)) return "unknown age";
  if (m < 1) return "just now";
  if (m < 60) return `${Math.round(m)} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

const CONF: Record<Confidence, { label: string; pct: number; tone: Detail["conf"]["tone"] }> = {
  unconfirmed: { label: "Unconfirmed", pct: 30, tone: "urgent" },
  corroborated: { label: "Corroborated", pct: 70, tone: "calm" },
  confirmed: { label: "Confirmed", pct: 95, tone: "ok" },
};

function tasksFor(b: V2Board, recordId: string) {
  return b.tasks.filter((t) => t.recordId === recordId);
}

function sourceSummary(s: Site): string {
  const by = new Map<string, number>();
  for (const x of s.sources) by.set(x.source, (by.get(x.source) ?? 0) + 1);
  const label: Record<string, string> = { x: "X post", person: "person on the desk", news: "news page", sheet: "sheet row", nasa: "NASA layer" };
  return [...by.entries()].map(([k, n]) => plural(n, label[k] ?? k)).join(", ") || "no sources";
}

// ---------- Sites ----------
function siteChip(b: V2Board, s: Site): Row["chip"] {
  const ts = tasksFor(b, s._id);
  const rescue = ts.find((t) => t.type === "rescue" && t.open);
  if (s.status === "closed") return { kind: "grey", text: "Closed" };
  if (s.status === "retracted") return { kind: "grey", text: "Retracted" };
  if (s.status === "team_on_site") return { kind: "ok", text: "Team on site" };
  if (rescue?.status === "accepted") return { kind: "move", text: "Team on the way" };
  if (rescue?.status === "waiting_approval") return { kind: "call", text: "Team waits for approval" };
  if (s.callStatus === "not_called") {
    const call = ts.find((t) => t.type === "call" && t.open);
    return call?.assignee ? { kind: "move", text: `${nameOf(call.assignee)} is calling` } : { kind: "call", text: "Needs a call" };
  }
  return { kind: "ok", text: s.callStatus === "verified" ? "Verified by call" : "Called" };
}

function siteRow(b: V2Board, s: Site, now: number): Row {
  const call = tasksFor(b, s._id).find((t) => t.type === "call" && t.open);
  const people = s.peopleTrapped > 0 ? `${plural(s.peopleTrapped, "person", "people")} trapped` : "number of people not known";
  const owner = call?.assignee ? `call by ${nameOf(call.assignee)}` : s.callStatus === "not_called" ? "no call owner" : "";
  return {
    key: `site:${s._id}`, kind: "site", id: s._id, tier: s.tier, score: s.priority, sortScore: s.priority,
    title: s.address, chip: siteChip(b, s),
    meta: [people, sourceSummary(s), age(s.observedAt, now), owner].filter(Boolean).join(", "),
  };
}

function siteDetail(b: V2Board, s: Site, now: number): Detail {
  const ts = tasksFor(b, s._id);
  const rescue = ts.find((t) => t.type === "rescue" && t.open);
  const call = ts.find((t) => t.type === "call" && t.open);
  const conf = CONF[s.confidence];
  const people = s.peopleTrapped > 0 ? plural(s.peopleTrapped, "person", "people") + " reported trapped" : "Number of people not known yet";
  const parts = [
    `Tier ${s.tier}.`,
    s.peopleTrapped > 0 ? `${plural(s.peopleTrapped, "person", "people")} trapped.` : "People inside, number not known.",
    `${conf.label} from ${sourceSummary(s)}.`,
    s.callStatus === "not_called" ? (call?.assignee ? `${nameOf(call.assignee)} has the callback.` : "Nobody has called yet.") : "Checked by a call.",
    rescue ? (rescue.status === "waiting_approval" ? "A field team waits for the coordinator." : `${nameOf(rescue.assignee)} has the rescue.`) : "",
    s.hazard ? `Hazard: ${s.hazard}.` : "",
  ];
  return {
    key: `site:${s._id}`, kindLabel: "Site", id: s._id, tier: s.tier, title: s.address,
    summary: `${people}. ${s.region}.`,
    conf: { ...conf, note: s.confidence === "confirmed" ? "Checked by a trusted person." : s.confidence === "corroborated" ? "3 or more independent public sources." : "Public posts only. A volunteer call settles it." },
    why: parts.filter(Boolean).join(" "),
    facts: [
      { label: "Call", value: s.callStatus.replace("_", " ") },
      { label: "Status", value: s.status.replace(/_/g, " ") },
      { label: "Support", value: plural(s.support, "voice") },
      { label: "Seen", value: age(s.observedAt, now) },
    ],
    history: [...s.history].reverse().map((h) => ({ when: h.ts, who: nameOf(h.by), what: h.reason })),
  };
}

// ---------- Needs ----------
function needTitle(b: V2Board, n: Need) {
  const site = b.sites.find((s) => n.siteIds.includes(s._id));
  return `${n.quantity} ${n.item}${site ? ` to ${site.address}` : `, ${n.region}`}`;
}

function needChip(b: V2Board, n: Need): Row["chip"] {
  const t = tasksFor(b, n._id).find((x) => x.type === "deliver" && (x.open || x.status === "blocked"));
  if (n.status === "proposed") return { kind: "grey", text: `Waiting for voices, ${Math.min(n.support, 3)} of 3` };
  if (t?.status === "blocked") return { kind: "act", text: "Delivery blocked" };
  if (n.status === "on_the_way") return { kind: "move", text: "On the way" };
  if (n.status === "assigned") return { kind: "move", text: `Assigned to ${nameOf(t?.assignee)}` };
  if (n.status === "delivered") return { kind: "ok", text: "Delivered" };
  if (n.status === "cancelled") return { kind: "grey", text: "Cancelled" };
  return { kind: "call", text: "Open, nobody has it" };
}

function needRow(b: V2Board, n: Need, now: number): Row {
  const first = n.history[0]?.ts;
  return {
    key: `need:${n._id}`, kind: "need", id: n._id, tier: n.tier, score: n.priority, sortScore: n.priority,
    title: needTitle(b, n), chip: needChip(b, n),
    meta: [n.lifeThreatening ? "life-threatening" : "", plural(n.support, "person", "people") + " asked", first ? `asked ${age(first, now)}` : ""]
      .filter(Boolean).join(", "),
  };
}

function needDetail(b: V2Board, n: Need, now: number): Detail {
  const conf = CONF[n.confidence];
  const t = tasksFor(b, n._id).find((x) => x.type === "deliver");
  return {
    key: `need:${n._id}`, kindLabel: "Need", id: n._id, tier: n.tier, title: needTitle(b, n),
    summary: `${n.lifeThreatening ? "Life-threatening. " : ""}Asked by ${n.requestedBy.map(nameOf).join(", ") || "unknown"}.`,
    conf: { ...conf, note: n.status === "proposed" ? "From the public. It opens when 3 different people ask, or one trusted person confirms." : "Asked by a trusted person or enough voices." },
    why: [
      `Tier ${n.tier}.`,
      n.lifeThreatening ? "Danger to life, so it never waits for more voices." : "",
      n.status === "proposed" ? `${Math.min(n.support, 3)} of 3 people asked so far.` : "",
      t ? `${nameOf(t.assignee)} has the delivery, status ${t.status.replace("_", " ")}.` : n.status === "open" ? "No supplier has it yet." : "",
    ].filter(Boolean).join(" "),
    facts: [
      { label: "Status", value: n.status.replace(/_/g, " ") },
      { label: "Quantity", value: String(n.quantity) },
      { label: "Voices", value: String(n.support) },
      { label: "First asked", value: age(n.history[0]?.ts, now) },
    ],
    history: [...n.history].reverse().map((h) => ({ when: h.ts, who: nameOf(h.by), what: h.reason })),
  };
}

// ---------- Incidents ----------
const INCIDENT_LABEL: Record<string, string> = {
  vehicle_breakdown: "Vehicle broke down", road_blocked: "Road blocked", cannot_find: "Cannot find the place",
  short_supply: "Not enough stock", unsafe: "Unsafe", injury: "Someone hurt", handover: "Shift ending",
  unreachable: "Not answering", other: "Other problem",
};

function incidentTier(i: Incident): Tier {
  return i.severity === "low" ? 1 : 0;
}

function incidentRow(i: Incident, now: number): Row {
  const sortScore = i.severity === "critical" ? 1000 : i.severity === "high" ? 500 : 100;
  return {
    key: `incident:${i._id}`, kind: "incident", id: i._id, tier: incidentTier(i), score: null, sortScore,
    title: INCIDENT_LABEL[i.kind] ?? i.kind,
    meta: [i.textEn, `by ${nameOf(i.reportedBy)}`, age(i.actions[0]?.ts ?? i.history[0]?.ts, now)].filter(Boolean).join(", "),
    chip: { kind: i.status === "resolved" ? "ok" : "act", text: i.status === "helping" ? "Desk is helping" : i.status === "escalated" ? "Escalated" : i.status === "resolved" ? "Resolved" : "Open" },
  };
}

function incidentDetail(i: Incident, now: number): Detail {
  return {
    key: `incident:${i._id}`, kindLabel: "Problem", id: i._id, tier: incidentTier(i), title: INCIDENT_LABEL[i.kind] ?? i.kind,
    summary: `${i.textEn}. Reported by ${nameOf(i.reportedBy)}${i.canContinue ? ", can continue" : ", cannot continue"}.`,
    conf: { label: "Reported by the person", pct: 95, tone: "ok", note: "Problems come from the person who has the task." },
    why: `Severity ${i.severity}. ${i.taskId ? `It stops ${i.taskId}. ` : ""}The help desk playbook already acted, listed below.`,
    facts: [
      { label: "Status", value: i.status },
      { label: "Severity", value: i.severity },
      { label: "Task", value: i.taskId ?? "none" },
      { label: "Last action", value: age(i.actions[i.actions.length - 1]?.ts, now) },
    ],
    history: [...i.actions].reverse().map((a) => ({ when: a.ts, who: "Desk", what: a.what })),
  };
}

// ---------- Shelters and roads ----------
function shelterNeedsAttention(s: Shelter, now: number) {
  return s.bedsTotal > 0 && (s.bedsUsed / s.bedsTotal >= 0.9 || minutesAgo(s.observedAt, now) > 30);
}

function shelterRow(s: Shelter, now: number): Row {
  const full = s.bedsTotal > 0 && s.bedsUsed / s.bedsTotal >= 0.9;
  const stale = minutesAgo(s.observedAt, now) > 30;
  return {
    key: `shelter:${s._id}`, kind: "shelter", id: s._id, tier: 1, score: null, sortScore: full ? 40 : 20,
    title: s.name, meta: `${s.bedsUsed} of ${s.bedsTotal} beds, counted ${age(s.observedAt, now)}`,
    chip: stale ? { kind: "call", text: "Count is old" } : { kind: "call", text: "Almost full" },
  };
}

function shelterDetail(s: Shelter, now: number): Detail {
  const free = Math.max(0, s.bedsTotal - s.bedsUsed);
  const stale = minutesAgo(s.observedAt, now) > 30;
  return {
    key: `shelter:${s._id}`, kindLabel: "Shelter", id: s._id, tier: 1, title: s.name,
    summary: `${s.bedsUsed} of ${s.bedsTotal} beds used, ${free} free. ${s.region}.`,
    conf: stale
      ? { label: "Old count", pct: 50, tone: "urgent", note: `Counted ${age(s.observedAt, now)}. The desk asks the shelter to confirm after 30 minutes.` }
      : { label: "Fresh count", pct: 90, tone: "ok", note: `Counted ${age(s.observedAt, now)}.` },
    why: `Tier 1. ${free <= 6 ? "Nearly full. " : ""}${stale ? "The number is older than 30 minutes." : ""}`.trim(),
    facts: [
      { label: "Used", value: String(s.bedsUsed) },
      { label: "Total", value: String(s.bedsTotal) },
      { label: "Free", value: String(free) },
      { label: "Counted", value: age(s.observedAt, now) },
    ],
    history: [...s.history].reverse().map((h) => ({ when: h.ts, who: nameOf(h.by), what: h.reason })),
  };
}

function roadRow(r: Road, now: number): Row {
  return {
    key: `road:${r._id}`, kind: "road", id: r._id, tier: 1, score: null, sortScore: r.state === "closed" ? 30 : 25,
    title: r.road, meta: `${r.state}, ${r.confidence}, ${age(r.observedAt, now)}`,
    chip: r.confidence === "unconfirmed" ? { kind: "call", text: "Ask a team to look" } : { kind: "grey", text: r.state === "closed" ? "Closed" : "Open" },
  };
}

function roadDetail(r: Road, now: number): Detail {
  const conf = CONF[r.confidence];
  return {
    key: `road:${r._id}`, kindLabel: "Road", id: r._id, tier: 1, title: r.road,
    summary: `${r.state === "closed" ? "Closed" : r.state === "open" ? "Open" : "Maybe closed"}. ${r.reason}.`,
    conf: { ...conf, note: r.confidence === "unconfirmed" ? "Uncertain danger still closes the road for routing." : "Checked." },
    why: `Tier 1. ${r.confidence === "unconfirmed" ? "Unconfirmed, so the nearest field team is asked to look after 20 minutes." : "A closed road changes routes and ETAs."}`,
    facts: [
      { label: "State", value: r.state },
      { label: "Confidence", value: r.confidence },
      { label: "Seen", value: age(r.observedAt, now) },
      { label: "Reason", value: r.reason },
    ],
    history: [...r.history].reverse().map((h) => ({ when: h.ts, who: nameOf(h.by), what: h.reason })),
  };
}

// ---------- The list ----------
export function rowsFromBoard(b: V2Board, now: number): Row[] {
  const rows: Row[] = [
    ...b.sites.filter((s) => s.status !== "closed" && s.status !== "retracted").map((s) => siteRow(b, s, now)),
    ...b.needs.filter((n) => n.status !== "delivered" && n.status !== "cancelled").map((n) => needRow(b, n, now)),
    ...b.incidents.filter((i) => i.status !== "resolved").map((i) => incidentRow(i, now)),
    ...b.shelters.filter((s) => shelterNeedsAttention(s, now)).map((s) => shelterRow(s, now)),
    ...b.roads.filter((r) => r.state !== "open").map((r) => roadRow(r, now)),
  ];
  return rows.sort((a, c) => a.tier - c.tier || c.sortScore - a.sortScore);
}

export function detailFor(b: V2Board, key: string, now: number): Detail | null {
  const [kind, id] = key.split(":") as [RecordKind, string];
  if (kind === "site") { const s = b.sites.find((x) => x._id === id); return s ? siteDetail(b, s, now) : null; }
  if (kind === "need") { const n = b.needs.find((x) => x._id === id); return n ? needDetail(b, n, now) : null; }
  if (kind === "incident") { const i = b.incidents.find((x) => x._id === id); return i ? incidentDetail(i, now) : null; }
  if (kind === "shelter") { const s = b.shelters.find((x) => x._id === id); return s ? shelterDetail(s, now) : null; }
  if (kind === "road") { const r = b.roads.find((x) => x._id === id); return r ? roadDetail(r, now) : null; }
  return null;
}

// ---------- Situation tiles ----------
export function situation(b: V2Board, now: number) {
  const noTeam = b.sites.filter((s) => s.tier === 0 && s.status === "open"
    && !b.tasks.some((t) => t.recordId === s._id && t.type === "rescue" && t.open && t.status !== "waiting_approval"));
  const approvals = b.tasks.filter((t) => t.status === "waiting_approval");
  const free = b.shelters.reduce((sum, s) => sum + Math.max(0, s.bedsTotal - s.bedsUsed), 0);
  const oldest = b.shelters.reduce((m, s) => Math.max(m, minutesAgo(s.observedAt, now)), 0);
  const temps = (b.zones ?? []).map((z) => z.minTempC).filter((t): t is number => typeof t === "number");
  return {
    noTeam: { count: noTeam.length, people: noTeam.reduce((n, s) => n + s.peopleTrapped, 0), first: noTeam[0]?.address },
    approvals: approvals.length,
    bedsFree: free, shelters: b.shelters.length, oldestShelter: Number.isFinite(oldest) ? oldest : 0,
    coldest: temps.length ? Math.min(...temps) : null,
  };
}

// ---------- Feed ----------
export type FeedEvent = Pick<Event, "type" | "source" | "actor" | "payload"> & { _id?: string; ts: Date | string };

export function feedLine(e: FeedEvent): string {
  const p = (e.payload ?? {}) as Record<string, unknown>;
  const text = (typeof p.textEn === "string" && p.textEn) || (typeof p.text === "string" && p.text) || "";
  if (e.type === "need") return `need, ${p.quantity ?? ""} ${p.item ?? ""}`.trim();
  if (e.type === "answer") return `answer on ${p.taskId ?? "a task"}, ${p.result ?? ""}`;
  if (e.type === "approval") return `${p.approved ? "approved" : "rejected"} ${p.taskId ?? "a task"}`;
  if (e.type === "capacity") return `shelter count, ${p.bedsUsed ?? "?"} of ${p.bedsTotal ?? "?"}`;
  if (e.type === "closure") return `road ${p.state ?? ""}, ${p.road ?? ""}`;
  return text ? `${e.type}, ${text}` : e.type;
}

export function openTasks(tasks: Task[], userId: string) {
  return tasks.filter((t) => t.open && t.assignee === userId).sort((a, c) => a.tier - c.tier || c.priority - a.priority);
}
