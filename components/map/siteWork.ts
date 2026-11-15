// What the desk is doing about one rescue site, in words: the call, the rescue, deliveries for
// its needs, problems in the field. Built from the board the map already polls (tasks, needs,
// incidents), so it needs no API of its own. The map card lists the lines; the map list and the
// card header use `phase`, one short line instead of a bare "waiting for a team".
// No ids on screen: people by name (or a tidy version of their id when the name is unknown),
// the dispatcher's reasons rewritten as plain English.
import type { Incident, Need, Site, Task } from "@/lib/types";
import { INCIDENT_WORD } from "../detail/locate";

export type WorkState = "done" | "moving" | "waiting" | "stuck";

export interface WorkLine {
  key: string;
  state: WorkState;
  label: string;          // "Call", "Rescue", "Delivery · 20 blankets", "Vehicle broke down"
  detail: string;         // "Verified by Volunteer Callback", "No one free · a coordinator decides"
  at?: Date | string;     // when this last changed
}

export interface SiteWork { phase: string; state: WorkState; lines: WorkLine[] }

export type Names = Record<string, string>;

interface Board { tasks: Task[]; needs: Need[]; incidents: Incident[] }

const OPEN = new Set<Task["status"]>(["created", "waiting_approval", "assigned", "accepted", "escalated", "blocked"]);
const ORDER: Record<string, number> = { call: 0, rescue: 1, evacuate: 2, assist: 3, deliver: 4, need: 4, notify: 5, problem: 6 };
const TYPE_WORD: Record<Task["type"], string> = {
  call: "Call", rescue: "Rescue", evacuate: "Evacuation", assist: "Help for the team", notify: "Notice", deliver: "Delivery",
};

/** "volunteer-callback" → "Volunteer Callback": better than an id when the name is not known. */
const tidy = (id: string) => id.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const nameOf = (names: Names, id?: string) => (id ? names[id] ?? tidy(id) : "someone");

const lastAt = (t: Task) => t.history.at(-1)?.ts;
const minutes = (d: Date | string, now: number) => Math.round((new Date(d).getTime() - now) / 60_000);

/** "Proposed team: Saha Ekibi A (field-alpha), 350 m away." → "Saha Ekibi A, 350 m away". */
function proposed(detail: string): string | undefined {
  const m = detail.match(/Proposed team: ([^(.]+?)\s*\([^)]*\)(, [^.]+? away)?\./);
  return m ? `${m[1]}${m[2] ?? ""}` : undefined;
}

/** "escalated, nobody fits: 1 field on the desk, 1 with 3 open tasks" → "1 field team on the desk, 1 with 3 open tasks". */
function whyStuck(t: Task): string | undefined {
  const reason = [...t.history].reverse().find((h) => /nobody fits|nobody has/.test(h.reason))?.reason;
  if (!reason) return undefined;
  const m = reason.match(/nobody (?:fits|has)[: ]+(.*)$/);
  const rest = (m?.[1] ?? "")
    .replace(/\b(\d+) (field|volunteer|supplier|coordinator|shelter)\b/g, (_, n, who) =>
      `${n} ${who === "field" ? "field team" : who === "shelter" ? "shelter desk" : who}${n === "1" ? "" : "s"}`)
    .replace(/\bno field\b/, "no field team").replace(/\s*\(.*?\)/g, "").trim();
  return rest || undefined;
}

function etaText(t: Task, now: number): string {
  if (!t.eta) return "";
  const m = minutes(t.eta, now);
  return m > 0 ? ` · about ${m} min` : m === 0 ? " · due now" : ` · ${-m} min late`;
}

function taskLine(t: Task, site: Site, b: Board, names: Names, now: number): WorkLine {
  const who = nameOf(names, t.assignee);
  const need = t.recordType === "need" ? b.needs.find((n) => n._id === t.recordId) : undefined;
  const label = t.type === "deliver" && need ? `Delivery · ${need.quantity} ${need.item}` : TYPE_WORD[t.type];
  const base = { key: `task:${t._id}`, label, at: lastAt(t) };
  switch (t.status) {
    case "created":
      return { ...base, state: "waiting", detail: "Looking for someone to take it" };
    case "waiting_approval": {
      const team = proposed(t.detail);
      return { ...base, state: "waiting", detail: `Waiting for a coordinator's OK${team ? ` · proposed: ${team}` : ""}` };
    }
    case "assigned":
      return { ...base, state: "waiting", detail: `Asked ${who} · waiting for an answer` };
    case "accepted":
      return {
        ...base, state: "moving",
        detail: t.progress === "arrived" ? `${who} is there`
          : t.progress === "en_route" ? `${who} is on the way${etaText(t, now)}`
          : `${who} took it${etaText(t, now)}`,
      };
    case "blocked": {
      const inc = b.incidents.find((i) => i._id === t.blockedBy);
      return { ...base, state: "stuck", detail: `Stopped: ${inc ? (INCIDENT_WORD[inc.kind] ?? "a problem").toLowerCase() : "a problem in the field"} · a replacement is being found` };
    }
    case "escalated": {
      const why = whyStuck(t);
      return { ...base, state: "stuck", detail: `No one free · a coordinator decides${why ? ` (${why})` : ""}` };
    }
    case "done":
      return {
        ...base, state: "done",
        detail: t.type === "call" && site.callStatus === "verified" ? `Verified by ${who}`
          : t.type === "deliver" ? `Delivered by ${who}` : `Done by ${who}`,
      };
    case "cancelled":
      return { ...base, state: "done", detail: t.history.some((h) => /rejected/.test(h.reason)) ? "Turned down by a coordinator" : "Cancelled" };
    default:   // declined, timed_out: the task moved on to someone else
      return { ...base, state: "waiting", detail: "Being passed to the next person" };
  }
}

function needLine(n: Need): WorkLine {
  const label = `${n.quantity} ${n.item}`;
  const base = { key: `need:${n._id}`, label };
  switch (n.status) {
    case "proposed": return { ...base, state: "waiting", detail: "Needed · waiting for more people to ask" };
    case "open": return { ...base, state: "waiting", detail: "Needed · looking for a supplier" };
    case "assigned": return { ...base, state: "waiting", detail: "A supplier was asked" };
    case "on_the_way": return { ...base, state: "moving", detail: "On the way" };
    case "delivered": return { ...base, state: "done", detail: "Delivered" };
    default: return { ...base, state: "done", detail: "Cancelled" };
  }
}

function problemLine(i: Incident): WorkLine {
  return {
    key: `incident:${i._id}`, state: "stuck", label: INCIDENT_WORD[i.kind] ?? "Problem in the field",
    detail: i.status === "helping" ? "Help is on the way" : i.status === "escalated" ? "A coordinator is on it" : "Reported, the desk is acting",
    at: i.actions.at(-1)?.ts ?? i.history.at(-1)?.ts,
  };
}

/** The one line a list row or a card header shows. Most pressing open work wins. */
function phaseOf(site: Site, open: Task[], problems: Incident[]): { phase: string; state: WorkState } {
  const by = (s: Task["status"], types?: Task["type"][]) => open.find((t) => t.status === s && (!types || types.includes(t.type)));
  const field: Task["type"][] = ["rescue", "evacuate", "assist"];
  if (by("blocked") || problems.length) return { phase: "Stopped by a problem", state: "stuck" };
  if (by("escalated", field)) return { phase: "Needs a coordinator: no team free", state: "stuck" };
  if (by("waiting_approval", field)) return { phase: "Waiting for a coordinator's OK", state: "waiting" };
  const going = by("accepted", field);
  if (going) return { phase: going.progress === "arrived" ? "A team is there" : going.progress === "en_route" ? "A team is on the way" : "A team took it", state: "moving" };
  if (by("assigned", field) || by("created", field)) return { phase: "Asking a team", state: "waiting" };
  if (by("escalated")) return { phase: "Needs a coordinator", state: "stuck" };
  const call = open.find((t) => t.type === "call");
  if (call) return { phase: call.status === "accepted" ? "Being checked by phone" : "Waiting for a call", state: call.status === "accepted" ? "moving" : "waiting" };
  if (open.length) return { phase: "Supplies on the way", state: "moving" };
  if (site.status === "team_on_site") return { phase: "A team is there", state: "moving" };
  if (site.status === "closed") return { phase: "Done", state: "done" };
  if (site.status === "retracted") return { phase: "Withdrawn", state: "done" };
  if (site.callStatus === "not_called") return { phase: "Not checked yet", state: "waiting" };
  return { phase: site.peopleTrapped > 0 ? "Verified, no team yet" : "Verified", state: site.peopleTrapped > 0 ? "waiting" : "done" };
}

export function siteWork(site: Site, b: Board, names: Names = {}, now = Date.now()): SiteWork {
  const needs = b.needs.filter((n) => n.siteIds.includes(site._id));
  const needIds = new Set(needs.map((n) => n._id));
  const tasks = b.tasks.filter((t) => (t.recordType === "site" && t.recordId === site._id) || (t.recordType === "need" && needIds.has(t.recordId)));
  const open = tasks.filter((t) => OPEN.has(t.status));

  // Per job (a type, and for deliveries the need): the open task, else the latest closed one.
  const jobs = new Map<string, Task>();
  for (const t of tasks) {
    const job = `${t.type}:${t.recordType === "need" ? t.recordId : ""}`;
    const had = jobs.get(job);
    const better = !had || (OPEN.has(t.status) && !OPEN.has(had.status))
      || (OPEN.has(t.status) === OPEN.has(had.status) && new Date(lastAt(t) ?? 0) > new Date(lastAt(had) ?? 0));
    if (better) jobs.set(job, t);
  }
  const ranked: { order: number; line: WorkLine }[] = [...jobs.values()]
    .map((t) => ({ order: ORDER[t.type], line: taskLine(t, site, b, names, now) }));
  // A need nobody is delivering yet still belongs in the list.
  for (const n of needs) if (!tasks.some((t) => t.recordId === n._id)) ranked.push({ order: ORDER.need, line: needLine(n) });
  const taskIds = new Set(tasks.map((t) => t._id));
  const problems = b.incidents.filter((i) => i.status !== "resolved" && i.taskId && taskIds.has(i.taskId));
  for (const i of problems) ranked.push({ order: ORDER.problem, line: problemLine(i) });
  const lines = ranked.sort((x, y) => x.order - y.order).map((r) => r.line);
  return { ...phaseOf(site, open, problems), lines };
}
