// What each role may read, written as short lines that always carry source and age.
// Used by the ask_desk tool and by the context block of every personal-agent turn.
// Rules (Final system design §9, "Personal agents"): read only; every fact has a source and an
// age from observedAt; a citizen never sees addresses or phone numbers.

import type { Event, HistoryEntry, Incident, Need, Road, Role, Shelter, Site, Task } from "@/lib/types";
import { maskPhones } from "../shared/privacy";
import type { Board } from "./port";

export type Topic = "summary" | "sites" | "needs" | "shelters" | "roads" | "incidents" | "tasks";

const CAN_SEE: Record<Role, Topic[]> = {
  coordinator: ["summary", "sites", "needs", "shelters", "roads", "incidents", "tasks"],
  volunteer: ["summary", "sites", "needs", "shelters", "roads"],
  field: ["summary", "sites", "needs", "shelters", "roads", "incidents"],
  supplier: ["summary", "needs", "shelters", "roads", "incidents"],
  shelter: ["summary", "needs", "shelters", "roads"],
  public: ["shelters", "roads"],
};

export function topicsFor(role: Role): Topic[] {
  return CAN_SEE[role];
}

export function age(t: Date | string | undefined, now: Date): string {
  if (!t) return "age unknown";
  const min = Math.round((+now - +new Date(t)) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

/** For deadlines: "in 5 min", "now", "12 min overdue". */
export function until(t: Date | string | undefined, now: Date): string {
  if (!t) return "no deadline";
  const min = Math.round((+new Date(t) - +now) / 60000);
  if (min > 0) return min < 60 ? `in ${min} min` : `in ${Math.round(min / 60)} h`;
  if (min === 0) return "now";
  return -min < 60 ? `${-min} min overdue` : `${Math.round(-min / 60)} h overdue`;
}

const lastSource = (h: HistoryEntry[] | undefined, fallback: string) => h?.[h.length - 1]?.source ?? fallback;
const tier = (t: number) => (t === 0 ? "T0 danger to life" : t === 1 ? "T1 urgent" : "T2 comfort");

function inRegion(region: string | undefined, r: string | undefined) {
  if (!region) return true;
  return (r ?? "").toLocaleLowerCase("tr").includes(region.toLocaleLowerCase("tr"));
}

export function siteLine(s: Site, now: Date, role: Role): string {
  const where = role === "public" ? s.region : `${s.address}, ${s.region}`;
  return `site ${s._id} · ${where} · ${s.peopleTrapped} trapped · call ${s.callStatus} · ${s.status} · ` +
    `${s.confidence}, ${s.sources.length} source(s), ${tier(s.tier)} · seen ${age(s.observedAt, now)}` +
    (s.hazard ? ` · HAZARD: ${s.hazard}` : "");
}
export function needLine(n: Need & { requestedBy?: string[] }, now: Date): string {
  const first = n.history?.[0]?.ts;
  return `need ${n._id} · ${n.quantity} ${n.item} · ${n.region} · ${n.status} · ${tier(n.tier)}` +
    `${n.lifeThreatening ? " · life-threatening" : ""} · ${n.support} person(s) asked · ` +
    `source ${lastSource(n.history, "desk")} · filed ${age(first, now)}`;
}
export function shelterLine(s: Shelter, now: Date): string {
  const free = s.bedsTotal - s.bedsUsed;
  return `shelter ${s._id} · ${s.name} · ${s.region} · ${s.bedsUsed}/${s.bedsTotal} beds (${free} free) · ` +
    `source ${lastSource(s.history, "desk")} · number from ${age(s.observedAt, now)}`;
}
export function roadLine(r: Road, now: Date): string {
  return `road ${r._id} · ${r.road} · ${r.state} (${r.confidence}) · ${r.reason} · ` +
    `source ${lastSource(r.history, "desk")} · ${age(r.observedAt, now)}`;
}
export function incidentLine(i: Incident, now: Date): string {
  const last = i.actions[i.actions.length - 1];
  return `incident ${i._id} · ${i.kind} · reported by ${i.reportedBy}${i.taskId ? ` on task ${i.taskId}` : ""} · ${i.severity} · ${i.status} · "${i.textEn}"` +
    (last ? ` · desk did: ${last.what} (${age(last.ts, now)})` : "");
}
// Titles and details can hold a full phone number for the volunteer who calls. The volunteer
// reads it on the task card; it never goes through the model.
export function taskLine(t: Task, now: Date, opts: { showDetail: boolean }): string {
  return `task ${t._id} · ${t.type} · ${maskPhones(t.title).text} · ${t.status}${t.assignee ? ` · owner ${t.assignee}` : " · no owner"} · ` +
    `${tier(t.tier)} · answer ${until(t.deadline, now)}` +
    (t.eta ? ` · ETA ${until(t.eta, now)}` : "") +
    (opts.showDetail ? ` · ${maskPhones(t.detail).text}` : "");
}

/** Answer for the ask_desk tool. Returns lines the model must quote, never invent around. */
export function askDesk(args: {
  board: Board; events: Event[]; role: Role; topic: Topic; region?: string; now: Date;
}): string {
  const { board: b, role, topic, region, now } = args;
  if (!CAN_SEE[role].includes(topic)) {
    return `Not available to the ${role} role. The ${role} role can ask about: ${CAN_SEE[role].join(", ")}.`;
  }
  const cap = (xs: string[], n = 12) =>
    xs.length === 0 ? "The desk has nothing on that." :
    xs.slice(0, n).join("\n") + (xs.length > n ? `\n(${xs.length - n} more not shown)` : "");
  const prio = <T extends { tier: number; priority: number }>(xs: T[]) =>
    [...xs].sort((a, c) => a.tier - c.tier || c.priority - a.priority);

  switch (topic) {
    case "sites":
      return cap(prio(b.sites.filter((s) => s.status !== "retracted" && inRegion(region, s.region)))
        .map((s) => siteLine(s, now, role)));
    case "needs":
      return cap(prio(b.needs.filter((n) => n.status !== "cancelled" && n.status !== "delivered" && inRegion(region, n.region)))
        .map((n) => needLine(n, now)));
    case "shelters":
      return cap([...b.shelters].filter((s) => inRegion(region, s.region))
        .sort((x, y) => (y.bedsTotal - y.bedsUsed) - (x.bedsTotal - x.bedsUsed)).map((s) => shelterLine(s, now)));
    case "roads":
      return cap(b.roads.filter((r) => r.state !== "open").map((r) => roadLine(r, now)));
    case "incidents":
      return cap(b.incidents.filter((i) => i.status !== "resolved")
        .sort((x, y) => sev(y.severity) - sev(x.severity)).map((i) => incidentLine(i, now)));
    case "tasks":
      return cap(prio(b.tasks.filter((t) => t.open)).map((t) => taskLine(t, now, { showDetail: false })));
    case "summary":
      return summary(args);
  }
}

const sev = (s: Incident["severity"]) => (s === "critical" ? 2 : s === "high" ? 1 : 0);

function summary({ board: b, events, role, now }: { board: Board; events: Event[]; role: Role; now: Date }): string {
  const out: string[] = [];
  const open = b.incidents.filter((i) => i.status !== "resolved");
  if (open.length && CAN_SEE[role].includes("incidents")) {
    out.push(`OPEN INCIDENTS (${open.length}):`, ...open.map((i) => "  " + incidentLine(i, now)));
  }
  if (role === "coordinator") {
    const stuck = b.tasks.filter((t) => t.status === "escalated" || t.status === "waiting_approval" ||
      (t.open && !t.assignee && t.tier === 0));
    if (stuck.length) out.push(`NEEDS A DECISION (${stuck.length}):`, ...stuck.map((t) => "  " + taskLine(t, now, { showDetail: true })));
  }
  const t0 = b.sites.filter((s) => s.tier === 0 && s.status === "open");
  if (t0.length && CAN_SEE[role].includes("sites")) {
    out.push(`OPEN DANGER-TO-LIFE SITES (${t0.length}):`, ...t0.map((s) => "  " + siteLine(s, now, role)));
  }
  const full = b.shelters.filter((s) => s.bedsUsed / s.bedsTotal >= 0.9);
  if (full.length) out.push(`SHELTERS 90% FULL OR MORE: ${full.map((s) => `${s.name} ${s.bedsUsed}/${s.bedsTotal} (${age(s.observedAt, now)})`).join("; ")}`);
  const closed = b.roads.filter((r) => r.state !== "open");
  if (closed.length) out.push(`ROADS NOT OPEN: ${closed.map((r) => `${r.road} (${r.state}, ${age(r.observedAt, now)})`).join("; ")}`);
  const recent = [...events].sort((a, c) => +new Date(c.ts) - +new Date(a.ts)).slice(0, 15);
  const seesSites = CAN_SEE[role].includes("sites"); // results can name addresses
  if (recent.length) {
    out.push(`LAST ${recent.length} EVENTS:`, ...recent.map((e) =>
      `  ${age(e.ts, now)} · ${e.type} from ${e.source}${seesSites ? `/${e.actor}` : ""}` +
      (seesSites && e.result?.reason ? ` → ${maskPhones(e.result.reason).text}` : ` · ${e.status}`)));
  }
  return out.length ? out.join("\n") : "The desk has nothing on that.";
}
