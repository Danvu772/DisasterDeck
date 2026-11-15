// Owned by Role 1. The memory keeper: the only writer of records (sites, needs, roads,
// shelters, zones, incidents). The Brain loop (workers/brain.ts) calls apply() with one event
// at a time. apply() writes records, and returns what changed plus what must happen to tasks.
// Tasks and inboxes are the dispatcher's: the keeper reads a task to check an answer, it never
// writes one. It says what to do in `actions`, and the dispatcher does it.
//
// apply() is safe to run twice on the same event (a crash between writing a record and marking
// the event): a site never gets the same source twice, a new record's id comes from the event,
// and every status move is guarded by the status it moves from.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { MongoServerError, type Filter } from "mongodb";
import { maskPhones } from "../agents/shared/privacy";
import { cols, getDb } from "../lib/db";
import { haversineMeters, normalizeAddress, normalizeText, pointInPolygon } from "../lib/geo";
import { conflictNote, resolveConflict, trustedClash, trustRank, type Stamp } from "../lib/rules/conflict";
import { blocks, PLAYBOOK, severity } from "../lib/rules/incidents";
import { decideReport, type SiteLite } from "../lib/rules/merge";
import { isTrusted, matchNeed, mergeLines, needStatus } from "../lib/rules/needs";
import { confidence, scored, siteTier, support, type Voice } from "../lib/rules/priority";
import {
  alertPayload, answerPayload, approvalPayload, capacityPayload, claimPayload, closurePayload, correctionPayload,
  incidentPayload, needPayload, planPayload, reportPayload,
} from "../lib/schemas";
import type {
  ClaimPayload, Confidence, Event, EventType, HistoryEntry, Incident, LatLng, Need, Post, RecordType, ReportPayload, Road,
  ScorePart, Shelter, Site, Source, Trust, Zone,
} from "../lib/types";
import { z } from "zod";

/** Event types the keeper handles today. Others stay pending until their handler lands. */
export const HANDLED: EventType[] = [
  "report", "answer", "approval", "incident", "need", "claim", "closure", "capacity", "alert", "correction", "plan",
];

/** One record the keeper created or changed: what the dispatcher reacts to. */
export interface Change {
  recordType: RecordType;
  recordId: string;
  op: "created" | "updated";
  eventId: string;
  fields: string[];
  /** What the dispatcher should do about it: "notify" (a road changed), "full", "confirm" (shelters),
   * "silent" (a zone), "rescored" (a record got a satellite term). */
  flags?: ("notify" | "full" | "confirm" | "silent" | "rescored" | "resolved")[];
  note?: string;
  /** A need moved to this status (the dispatcher tells the people who asked). */
  toStatus?: Need["status"];
}

/** What must happen to a task. The keeper decides it, the dispatcher (the tasks' writer) does it. */
export type TaskAction =
  | { kind: "accept"; taskId: string; by: string; etaMinutes?: number; progress?: "en_route" | "arrived"; note?: string }
  | { kind: "decline"; taskId: string; by: string; note?: string }
  | { kind: "done"; taskId: string; by: string; note?: string }
  | { kind: "approve"; taskId: string; by: string; assignee?: string; eventId?: string }
  | {
      kind: "plan"; eventId: string; deskId: string; by: string; ts: Date; reason: string;
      exits: { zoneId: string; zone?: string; name: string; exit: string }[];
    }
  | { kind: "reject"; taskId: string; by: string }
  | { kind: "block"; taskId: string; by: string; incidentId: string; reason: string }
  | {
      kind: "claim"; type: ClaimPayload["what"]; recordType: "site" | "need"; recordId: string;
      deskId: string; by: string; etaMinutes?: number; text: string;
    }
  | { kind: "cancel"; recordType: "site" | "need"; recordId: string; deskId: string; by: string; reason: string };

export interface KeeperResult {
  status: "done" | "merged" | "rejected";
  result: NonNullable<Event["result"]>;
  changes: Change[];
  actions: TaskAction[];
}

export async function apply(event: Event): Promise<KeeperResult> {
  switch (event.type) {
    case "report": return applyReport(event);
    case "answer": return applyAnswer(event);
    case "approval": return applyApproval(event);
    case "incident": return applyIncident(event);
    case "need": return applyNeed(event);
    case "claim": return applyClaim(event);
    case "closure": return applyClosure(event);
    case "capacity": return applyCapacity(event);
    case "alert": return applyAlert(event);
    case "correction": return applyCorrection(event);
    case "plan": return applyPlan(event);
    default:
      // The Brain only takes HANDLED types, so this means a bug, not bad input.
      throw new Error(`memory keeper has no handler for "${event.type}"`);
  }
}

// ---------- reports → sites ----------

const reject = (reason: string, textKey?: string): KeeperResult => ({
  status: "rejected", result: { recordIds: [], reason, ...(textKey ? { textKey } : {}) }, changes: [], actions: [],
});

const mask = (text: string) => maskPhones(text).text;
const firstIssue = (err: { issues: { message: string }[] }) => err.issues[0]?.message;

/** "Site 57": one counter per desk in `meta`, shared by sites, needs and incidents (G-07). */
async function nextCaseNo(desk: string): Promise<number> {
  const meta = (await getDb()).collection<{ _id: string; n: number }>("meta");
  const doc = await meta.findOneAndUpdate(
    { _id: `cases:${desk}` }, { $inc: { n: 1 } }, { upsert: true, returnDocument: "after" },
  );
  return doc!.n;
}

async function insertOnce(insert: () => Promise<unknown>): Promise<void> {
  try {
    await insert();
  } catch (err) {
    if (!(err instanceof MongoServerError && err.code === 11000)) throw err; // already made on a run that crashed
  }
}

async function applyReport(event: Event): Promise<KeeperResult> {
  // Checked at the door already when it came over HTTP, but server code can call postEvent()
  // directly. Text from outside is data: if it does not fit the schema, it does not get in.
  const parsed = reportPayload.safeParse(event.payload);
  if (!parsed.success) return reject(`payload is not a valid report: ${parsed.error.issues[0]?.message}`);
  const p: ReportPayload = parsed.data;
  const eventId = event._id!;
  const textKey = normalizeText(p.text) ?? undefined;
  const c = await cols();

  const openSites = await c.sites
    .find({ deskId: event.deskId, status: { $ne: "retracted" } }, { projection: { _id: 1, address: 1, coords: 1 } })
    .toArray() as SiteLite[];
  const openIds = new Set(openSites.map((s) => s._id));

  // Rule 1: the same text was reported before → the site that report went to.
  let copyOfSiteId: string | undefined;
  if (textKey) {
    const earlier = await c.events.findOne(
      { deskId: event.deskId, "result.textKey": textKey, _id: { $ne: eventId }, status: { $in: ["done", "merged"] } },
      { projection: { result: 1 }, sort: { ts: 1 } },
    );
    copyOfSiteId = earlier?.result?.recordIds.find((id) => openIds.has(id));
  }

  const decision = decideReport(p, {
    sites: openSites, copyOfSiteId, siteExists: p.siteId ? openIds.has(p.siteId) : undefined,
  });
  if (decision.action === "reject") return reject(decision.reason, textKey);

  const now = new Date();
  const observedAt = event.observedAt ?? event.ts;
  const entry: HistoryEntry = {
    ts: now, by: event.actor, source: event.source,
    reason: `${p.kind}${p.peopleCount ? ` (${p.peopleCount} people)` : ""}: ${decision.reason}`,
  };
  // A danger at the place, from a post or a person (v2.5). Masked like every text from outside.
  const hazard = p.hazard?.trim() ? mask(p.hazard.trim()) : undefined;
  if (hazard) entry.reason += `; hazard: ${hazard}`;
  const thisVoice = await voiceOf(event, textKey);
  // The post as the screens show it, phone numbers masked before it is stored (decision D3).
  const post: Post = {
    eventId, source: event.source, actor: event.actor, text: mask(p.text), textEn: mask(p.textEn), observedAt,
  };

  if (decision.action === "new") {
    const people = p.kind === "trapped" ? (p.peopleCount ?? 1) : 0;
    const voices = [thisVoice];
    const site: Site = {
      _id: `site-${eventId}`,             // from the event, so a re-run cannot make a second site
      address: p.address ?? "address unknown",
      ...(p.coords ? { coords: p.coords } : {}),
      region: p.region ?? "unknown",
      ...(hazard ? { hazard } : {}),
      peopleTrapped: people,
      callStatus: "not_called",
      status: "open",
      sources: [{ source: event.source, eventId }],
      history: [{ ...entry, reason: `opened from a ${p.kind} report: ${decision.reason}` }],
      deskId: event.deskId,
      confidence: confidence(voices),
      observedAt,
      tier: siteTier(people, [p.kind]),
      support: support(voices),
      supporters: supportersOf(voices),
      ...scored({ support: support(voices), waitingSince: observedAt }, now),
      posts: [post],
      caseNo: 0,
    };
    // A re-run after a crash finds the site made: no second case number. It still reports the
    // site as created, so the dispatcher gets a second chance at the call task.
    if (!(await c.sites.findOne({ _id: site._id }, { projection: { _id: 1 } }))) {
      site.caseNo = await nextCaseNo(event.deskId);
      await insertOnce(() => c.sites.insertOne(site));
    }
    return {
      status: "done",
      result: { recordIds: [site._id], reason: site.history[0].reason, ...(textKey ? { textKey } : {}) },
      changes: [{ recordType: "site", recordId: site._id, op: "created", eventId, fields: Object.keys(site) }],
      actions: [],
    };
  }

  // Merge into an existing site.
  const site = await c.sites.findOne({ _id: decision.siteId });
  if (!site) return reject(`site ${decision.siteId} disappeared`, textKey);
  const result = { recordIds: [site._id], reason: entry.reason, ...(textKey ? { textKey } : {}) };
  if (site.sources.some((s) => s.eventId === eventId)) {
    return { status: "merged", result, changes: [], actions: [] }; // this event was already applied
  }

  const voices = [...(await voicesOf(site.sources.map((s) => s.eventId))), thisVoice];
  let people = site.peopleTrapped;
  if (p.kind === "trapped" || p.kind === "missing") {
    // A repeat of a call says how many are trapped, it does not add more people.
    if (p.kind === "trapped" && p.peopleCount !== undefined) people = Math.max(people, p.peopleCount);
  } else if (p.kind === "rescued") {
    people = Math.max(0, people - (p.peopleCount ?? 1));
  }
  const firstSeen = observedAt < site.observedAt ? observedAt : site.observedAt;
  const sup = support(voices);
  const set: Partial<Site> = {
    peopleTrapped: people,
    confidence: confidence(voices),
    support: sup,
    supporters: supportersOf(voices),
    tier: siteTier(people, []),
    observedAt: firstSeen,
    ...scored({ support: sup, waitingSince: firstSeen }, now),
  };
  // A later report can fill in what the first one did not know. It never overwrites.
  if (site.address === "address unknown" && p.address) set.address = p.address;
  if (!site.coords && p.coords) set.coords = p.coords;
  if (site.region === "unknown" && p.region) set.region = p.region;
  // A hazard is added, never wiped: one an unsafe incident set stays until someone clears it.
  if (!site.hazard && hazard) set.hazard = hazard;
  if (decision.copy) entry.reason = `copy of an earlier report (adds a source, not support)`;

  await c.sites.updateOne(
    { _id: site._id, "sources.eventId": { $ne: eventId } },
    {
      $set: set,
      // The latest 5 posts, newest last (G-08).
      $push: { sources: { source: event.source, eventId }, history: entry, posts: { $each: [post], $slice: -5 } },
    },
  );
  const fields = Object.keys(set).filter((k) => JSON.stringify(set[k as keyof Site]) !== JSON.stringify(site[k as keyof Site]));
  return {
    status: "merged",
    result: { ...result, reason: entry.reason },
    changes: [{ recordType: "site", recordId: site._id, op: "updated", eventId, fields: [...fields, "sources", "history", "posts"] }],
    actions: [],
  };
}

// ---------- answers: a person says yes, no, or done ----------

const historyOf = (event: Event, reason: string): HistoryEntry => ({ ts: new Date(), by: event.actor, source: event.source, reason });

/** Move a record one step, only from the status it is in now. Returns the change, or none. */
async function moveSite(event: Event, siteId: string, from: Filter<Site>, set: Partial<Site>, reason: string): Promise<Change[]> {
  const { sites } = await cols();
  const r = await sites.updateOne({ _id: siteId, ...from }, { $set: set, $push: { history: historyOf(event, reason) } });
  return r.modifiedCount
    ? [{ recordType: "site", recordId: siteId, op: "updated", eventId: event._id!, fields: [...Object.keys(set), "history"] }]
    : [];
}

async function moveNeed(event: Event, needId: string, from: Need["status"][], set: Partial<Need>, reason: string): Promise<Change[]> {
  const { needs } = await cols();
  const r = await needs.updateOne({ _id: needId, status: { $in: from } }, { $set: set, $push: { history: historyOf(event, reason) } });
  return r.modifiedCount
    ? [{ recordType: "need", recordId: needId, op: "updated", eventId: event._id!, fields: [...Object.keys(set), "history"], ...(set.status ? { toStatus: set.status } : {}) }]
    : [];
}

const done = (recordIds: string[], reason: string, changes: Change[], actions: TaskAction[], status: KeeperResult["status"] = "done"): KeeperResult =>
  ({ status, result: { recordIds, reason }, changes, actions });

async function applyAnswer(event: Event): Promise<KeeperResult> {
  const parsed = answerPayload.safeParse(event.payload);
  if (!parsed.success) return reject(`payload is not a valid answer: ${firstIssue(parsed.error)}`);
  const p = parsed.data;
  const { tasks } = await cols();
  const task = await tasks.findOne({ _id: p.taskId, deskId: event.deskId });
  if (!task) return reject(`task ${p.taskId} not found`);
  if (task.assignee !== event.actor) {
    return reject(`task ${task._id} is ${task.assignee ? `assigned to ${task.assignee}` : "not assigned to anyone"}, so ${event.actor} cannot answer it`);
  }
  if (task.status !== "assigned" && task.status !== "accepted") return reject(`task ${task._id} is ${task.status}, it takes no answer now`);
  const note = p.note ? mask(p.note) : undefined;
  const who = event.actor;
  const changes: Change[] = [];
  const onSite = task.recordType === "site";
  const onNeed = task.recordType === "need";

  if (p.result === "accepted") {
    if (onSite && task.type === "call") {
      changes.push(...await moveSite(event, task.recordId, { callStatus: "not_called" }, { callStatus: "called" }, `${who} took the call`));
    }
    if (onSite && p.progress === "arrived") {
      // Decision D7: the field phone's "arrived" is what puts a team on the site.
      changes.push(...await moveSite(event, task.recordId, { status: "open" }, { status: "team_on_site" }, `${who} arrived on site`));
    }
    if (onNeed && task.type === "deliver") {
      changes.push(...await moveNeed(event, task.recordId, ["open", "assigned"], { status: "on_the_way" }, `${who} is bringing it`));
    }
    const eta = p.etaMinutes !== undefined ? `, about ${p.etaMinutes} min` : "";
    const step = p.progress === "arrived" ? ", arrived" : p.progress === "en_route" ? ", on the way" : "";
    return done([task._id, task.recordId], `task ${task._id} accepted by ${who}${eta}${step}`, changes,
      [{ kind: "accept", taskId: task._id, by: who, etaMinutes: p.etaMinutes, progress: p.progress, note }]);
  }

  if (p.result === "declined") {
    return done([task._id], `task ${task._id} declined by ${who}`, [], [{ kind: "decline", taskId: task._id, by: who, note }]);
  }

  // done: the record moves on.
  if (onSite && task.type === "call") {
    // A volunteer's call is a trusted check (§5): the site is verified and confirmed.
    changes.push(...await moveSite(event, task.recordId, { callStatus: { $ne: "verified" } },
      { callStatus: "verified", confidence: "confirmed" }, `verified by ${who}'s call${note ? `: ${note}` : ""}`));
  }
  if (onSite && task.type === "rescue") {
    changes.push(...await moveSite(event, task.recordId, { status: { $in: ["open", "team_on_site"] } }, { status: "closed" },
      `rescue done by ${who}${note ? `: ${note}` : ""}`));
  }
  if (onNeed && task.type === "deliver") {
    changes.push(...await moveNeed(event, task.recordId, ["open", "assigned", "on_the_way"], { status: "delivered" }, `delivered by ${who}`));
  }
  return done([task._id, task.recordId], `task ${task._id} done by ${who}`, changes, [{ kind: "done", taskId: task._id, by: who, note }]);
}

// ---------- approvals: a coordinator decides a high-risk task ----------

async function applyApproval(event: Event): Promise<KeeperResult> {
  const parsed = approvalPayload.safeParse(event.payload);
  if (!parsed.success) return reject(`payload is not a valid approval: ${firstIssue(parsed.error)}`);
  const p = parsed.data;
  const { tasks, users } = await cols();
  const task = await tasks.findOne({ _id: p.taskId, deskId: event.deskId });
  if (!task) return reject(`task ${p.taskId} not found`);
  const me = await users.findOne({ _id: event.actor }, { projection: { role: 1 } });
  if (me?.role !== "coordinator") return reject(`only a coordinator can approve, and ${event.actor} is not one`);
  if (task.status !== "waiting_approval") return reject(`task ${task._id} is ${task.status}, not waiting for approval`);
  if (!p.approved) {
    return done([task._id], `task ${task._id} rejected by ${event.actor}`, [], [{ kind: "reject", taskId: task._id, by: event.actor }]);
  }
  if (task.type === "evacuate") return approveEvacuation(event, task, p.assignee);
  if (p.assignee && !(await users.findOne({ _id: p.assignee, deskId: task.deskId }, { projection: { _id: 1 } }))) {
    return reject(`${p.assignee} is not a person on this desk`);
  }
  return done([task._id], `task ${task._id} approved by ${event.actor}${p.assignee ? `, send ${p.assignee} instead` : ""}`, [],
    [{ kind: "approve", taskId: task._id, by: event.actor, assignee: p.assignee, eventId: event._id }]);
}

// ---------- plans: an evacuation plan waits for a coordinator ----------

/** The zones of a plan on this desk. A zone id can be the plain id or "<desk>:<id>" (see applyAlert). */
async function zonesOfPlan(desk: string, exits: { zoneId: string }[]): Promise<Map<string, Zone>> {
  const { zones } = await cols();
  const ids = exits.flatMap((e) => [e.zoneId, `${desk}:${e.zoneId}`]);
  const found = await zones.find({ deskId: desk, _id: { $in: ids } }).toArray();
  return new Map(exits.flatMap((e) => {
    const z = found.find((f) => f._id === e.zoneId) ?? found.find((f) => f._id === `${desk}:${e.zoneId}`);
    return z ? [[e.zoneId, z] as [string, Zone]] : [];
  }));
}

async function applyPlan(event: Event): Promise<KeeperResult> {
  const parsed = planPayload.safeParse(event.payload);
  if (!parsed.success) return reject(`payload is not a valid plan: ${firstIssue(parsed.error)}`);
  if (event.source === "person") return reject("a plan comes from the planner or an agent, not from a person");
  const eventId = event._id!;
  const c = await cols();
  // One exit per zone: the last one named wins.
  const exits = [...new Map(parsed.data.zoneExits.map((e) => [e.zoneId, e])).values()];
  if (!exits.length) return reject("a plan must name at least one zone");
  const reason = mask(parsed.data.reason);
  const known = await zonesOfPlan(event.deskId, exits);
  const changes: Change[] = [];
  for (const e of exits) {
    const z = known.get(e.zoneId);
    if (!z) continue;
    const r = await c.zones.updateOne({ _id: z._id, "history.eventId": { $ne: eventId } },
      { $push: { history: withEvent(event, `evacuation plan proposed: exit ${e.exit} (${reason}). A coordinator decides`) } });
    if (r.modifiedCount) changes.push({ recordType: "zone", recordId: z._id, op: "updated", eventId, fields: ["history"] });
  }
  return done([...known.values()].map((z) => z._id),
    `evacuation plan for ${exits.length} zone${exits.length === 1 ? "" : "s"}, ${known.size} known: ${exits.map((e) => `${e.zoneId} → ${e.exit}`).join(", ")}`,
    changes, [{
      kind: "plan", eventId, deskId: event.deskId, by: event.actor, ts: event.ts, reason,
      exits: exits.map((e) => ({ zoneId: e.zoneId, ...(known.get(e.zoneId) ? { zone: known.get(e.zoneId)!._id } : {}), name: known.get(e.zoneId)?.name ?? prettyZone(e.zoneId), exit: e.exit })),
    }]);
}

/** A coordinator approved an evacuation plan: each zone gets its exit. The dispatcher closes the task. */
async function approveEvacuation(event: Event, task: { _id: string; history: HistoryEntry[]; deskId: string }, assignee?: string): Promise<KeeperResult> {
  const c = await cols();
  const planId = task.history.find((h) => h.eventId)?.eventId;
  const plan = planId ? await c.events.findOne({ _id: planId, type: "plan" }) : null;
  const parsed = planPayload.safeParse(plan?.payload);
  if (!plan || !parsed.success) return reject(`the plan behind task ${task._id} was not found`);
  const exits = [...new Map(parsed.data.zoneExits.map((e) => [e.zoneId, e])).values()];
  const known = await zonesOfPlan(task.deskId, exits);
  const changes: Change[] = [];
  for (const e of exits) {
    const z = known.get(e.zoneId);
    if (!z) continue;
    const r = await c.zones.updateOne({ _id: z._id, "history.eventId": { $ne: event._id! } },
      { $set: { exitAssigned: e.exit }, $push: { history: withEvent(event, `evacuation exit set to ${e.exit}: approved by ${event.actor}`) } });
    if (r.modifiedCount) changes.push({ recordType: "zone", recordId: z._id, op: "updated", eventId: event._id!, fields: ["exitAssigned", "history"] });
  }
  return done([task._id, ...known.keys()].filter(Boolean), `evacuation plan approved by ${event.actor}: ${known.size} zone(s) got their exit${assignee ? " (a named person is not needed, no field team goes)" : ""}`,
    changes, [{ kind: "approve", taskId: task._id, by: event.actor, eventId: event._id }]);
}

// ---------- incidents: the help desk (§6) ----------

/** The need a short_supply incident splits off: its id comes from the incident, so a re-run finds it. */
export const restNeedId = (incidentId: string) => `need-${incidentId.replace(/^inc-/, "")}-rest`;

async function applyIncident(event: Event): Promise<KeeperResult> {
  const parsed = incidentPayload.safeParse(event.payload);
  if (!parsed.success) return reject(`payload is not a valid incident: ${firstIssue(parsed.error)}`);
  const p = parsed.data;
  const eventId = event._id!;
  const c = await cols();
  const textEn = mask(p.textEn || p.text);
  const now = new Date();

  if (p.incidentId) {
    const inc = await c.incidents.findOne({ _id: p.incidentId, deskId: event.deskId });
    if (!inc) return reject(`incident ${p.incidentId} not found`);
    if (hasEvent(inc.history, eventId)) return done([inc._id], "already applied", [], [], "merged");
    const status: Incident["status"] = p.resolved ? "resolved" : inc.status;
    const freed = p.resolved ? await freePeople(inc) : [];
    await c.incidents.updateOne({ _id: inc._id }, {
      $set: { status, canContinue: p.canContinue },
      $push: {
        history: withEvent(event, p.resolved ? `resolved: ${textEn}` : `update: ${textEn}`),
        actions: {
          ts: now,
          what: p.resolved ? `${event.actor} says it is over${freed.length ? `, ${freed.join(" and ")} available again` : ""}` : `update from ${event.actor}`,
        },
      },
    });
    return done([inc._id], `incident ${inc._id} ${p.resolved ? "resolved" : "updated"}`,
      [{ recordType: "incident", recordId: inc._id, op: "updated", eventId, fields: ["status", "history", "actions"], ...(p.resolved ? { flags: ["resolved" as const] } : {}) }], [], "merged");
  }

  const plan = PLAYBOOK[p.kind];
  const task = p.taskId ? await c.tasks.findOne({ _id: p.taskId, deskId: event.deskId }) : null;
  const need = task?.recordType === "need" ? await c.needs.findOne({ _id: task.recordId }) : null;
  const me = await c.users.findOne({ _id: event.actor }, { projection: { role: 1 } });
  // Only the person on the task, a coordinator, or the sweeper (nobody answers) can act on it.
  const mayAct = Boolean(task?.open && task.status !== "escalated" && (task.assignee === event.actor || me?.role === "coordinator"
    || (event.actor === "sweeper" && event.source === "system")));
  const block = mayAct && blocks(p.kind, p.canContinue);

  const id = `inc-${eventId}`;
  const changes: Change[] = [];
  const fresh = !(await c.incidents.findOne({ _id: id }, { projection: { _id: 1 } }));
  if (fresh) {
    const incident: Incident = {
      _id: id, deskId: event.deskId, kind: p.kind, reportedBy: event.actor,
      ...(p.taskId ? { taskId: p.taskId } : {}),
      ...(p.coords ? { coords: p.coords } : {}),
      severity: severity(p.kind, p.canContinue, need?.lifeThreatening ?? false),
      canContinue: p.canContinue, text: mask(p.text), textEn,
      status: "open",
      actions: [{
        ts: now, what: `${event.actor} reported ${p.kind.replace(/_/g, " ")}`
          + (p.taskId && !task ? `, task ${p.taskId} not found` : ""),
        ...(p.taskId ? { taskId: p.taskId } : {}),
      }],
      history: [withEvent(event, textEn)],
      caseNo: await nextCaseNo(event.deskId),
    };
    await insertOnce(() => c.incidents.insertOne(incident));
  }
  changes.push({ recordType: "incident", recordId: id, op: "created", eventId, fields: ["status", "severity", "taskId"] });

  // The record side effects run once, for the event that opened the incident (a re-run adds nothing).
  if (fresh) {
    const step = (what: string, taskId?: string) =>
      c.incidents.updateOne({ _id: id }, { $push: { actions: { ts: new Date(), what, ...(taskId ? { taskId } : {}) } } });
    if (task && plan.hazard && task.recordType === "site") {
      changes.push(...await moveSite(event, task.recordId, {}, { hazard: textEn }, `hazard: ${p.kind}`));
      await step(`site flagged as a hazard: ${textEn}`);
    } else if (task && plan.hazard && need?.siteIds[0]) {
      changes.push(...await moveSite(event, need.siteIds[0], {}, { hazard: textEn }, `hazard: ${p.kind}`));
      await step(`site flagged as a hazard: ${textEn}`);
    }
    if (block && need && plan.reopenNeed) {
      // What did not arrive goes back to open. The dispatcher's replacement takes it from there.
      changes.push(...await moveNeed(event, need._id, ["assigned", "on_the_way"], { status: "open" }, `back to open: incident ${id}`));
    }
    if (block && plan.busy) {
      const who = await setBusy([event.actor, task?.assignee]);
      if (who.length) await step(`${who.join(" and ")} marked busy until the problem is over`);
    }
    if (mayAct && plan.splitNeed && need && p.canDeliver !== undefined && p.canDeliver < need.quantity) {
      changes.push(...await splitNeed(event, id, need, p.canDeliver, step));
    }
    if (plan.verifySite && task?.recordType === "site") {
      changes.push(...await verifyAgain(event, id, task.recordId, textEn, step));
    }
    if (plan.closure) changes.push(...await closeRoad(event, id, p, textEn, step));
  }
  return done([id, ...(task ? [task._id] : [])],
    `incident ${id} opened (${p.kind})${block ? `, task ${task!._id} blocked` : ""}`, changes,
    block ? [{ kind: "block", taskId: task!._id, by: event.actor, incidentId: id, reason: `${p.kind.replace(/_/g, " ")}: ${textEn}` }] : []);
}

/**
 * Users are written by the app's API, and there is no clean call from here, so these two small
 * writes (busy, available again) live next to the incident and touch only `status`. Only a person
 * who is "available" becomes busy, and only a "busy" one is freed: offline stays offline.
 */
async function setBusy(ids: (string | undefined)[]): Promise<string[]> {
  const { users } = await cols();
  const list = [...new Set(ids.filter((i): i is string => Boolean(i) && i !== "sweeper"))];
  const mine = await users.find({ _id: { $in: list }, status: "available" }, { projection: { _id: 1 } }).toArray();
  if (!mine.length) return [];
  await users.updateMany({ _id: { $in: mine.map((u) => u._id) }, status: "available" }, { $set: { status: "busy" } });
  return mine.map((u) => u._id);
}

/** Resolved: the reporter and the blocked task's assignee are free again, if they were busy. */
async function freePeople(inc: Incident): Promise<string[]> {
  const { users, tasks } = await cols();
  const assignee = inc.taskId ? (await tasks.findOne({ _id: inc.taskId }, { projection: { assignee: 1 } }))?.assignee : undefined;
  const list = [...new Set([inc.reportedBy, assignee].filter((i): i is string => Boolean(i) && i !== "sweeper"))];
  const busy = await users.find({ _id: { $in: list }, deskId: inc.deskId, status: "busy" }, { projection: { _id: 1 } }).toArray();
  if (!busy.length) return [];
  await users.updateMany({ _id: { $in: busy.map((u) => u._id) }, status: "busy" }, { $set: { status: "available" } });
  return busy.map((u) => u._id);
}

/** short_supply: the reported amount stays on the need, the rest becomes its own open need. */
async function splitNeed(event: Event, incidentId: string, need: Need, canDeliver: number, step: (what: string) => Promise<unknown>): Promise<Change[]> {
  const c = await cols();
  const restId = restNeedId(incidentId);
  if (await c.needs.findOne({ _id: restId }, { projection: { _id: 1 } })) return [];
  const rest = need.quantity - canDeliver;
  // The last lines give up their quantity first.
  const keep = need.lines.map((l) => ({ ...l }));
  const moved: Need["lines"] = [];
  let left = rest;
  for (let i = keep.length - 1; i >= 0 && left > 0; i--) {
    const take = Math.min(keep[i].quantity, left);
    keep[i].quantity -= take; left -= take;
    moved.unshift({ ...(keep[i].siteId ? { siteId: keep[i].siteId } : {}), quantity: take });
  }
  const kept = keep.filter((l) => l.quantity > 0);
  const now = new Date();
  const sites = [...new Set(moved.map((l) => l.siteId).filter((s): s is string => Boolean(s)))];
  const second: Need = {
    _id: restId, item: need.item, quantity: rest, region: need.region, siteIds: sites.length ? sites : need.siteIds,
    status: "open", history: [{ ...historyOf(event, `the rest of ${need.item} (${rest}) from ${need._id}: the first supplier can bring ${canDeliver}, incident ${incidentId}`), ts: now }],
    deskId: need.deskId, confidence: need.confidence, lifeThreatening: need.lifeThreatening, lines: moved,
    tier: need.tier, priority: need.priority, support: need.support, requestedBy: [],
    ...(need.scoreParts ? { scoreParts: need.scoreParts } : {}), caseNo: await nextCaseNo(event.deskId),
  };
  await insertOnce(() => c.needs.insertOne(second));
  await c.needs.updateOne({ _id: need._id }, {
    $set: { quantity: canDeliver, lines: kept },
    $push: { history: historyOf(event, `only ${canDeliver} of ${need.quantity} will come, the other ${rest} are need ${restId}`) },
  });
  await step(`${canDeliver} of ${need.quantity} ${need.item} continue, the other ${rest} are a new open need`);
  return [
    { recordType: "need", recordId: need._id, op: "updated", eventId: event._id!, fields: ["quantity", "lines", "history"] },
    { recordType: "need", recordId: restId, op: "created", eventId: event._id!, fields: ["status", "quantity", "lines"] },
  ];
}

/** cannot_find: the site goes back to "not called", unless it already failed once before (a coordinator decides). */
async function verifyAgain(event: Event, incidentId: string, siteId: string, text: string, step: (what: string) => Promise<unknown>): Promise<Change[]> {
  const c = await cols();
  const atSite = (await c.tasks.find({ deskId: event.deskId, recordId: siteId }, { projection: { _id: 1 } }).toArray()).map((t) => t._id);
  const before = await c.incidents.countDocuments({ deskId: event.deskId, kind: "cannot_find", _id: { $ne: incidentId }, taskId: { $in: atSite } });
  if (before > 0) {
    await step("second time the address could not be found: it needs a coordinator");
    return [];
  }
  const changes = await moveSite(event, siteId, {}, { callStatus: "not_called" }, `address not found, to be verified by phone again: ${text}`);
  await step("site back to not called: a volunteer verifies the address by phone");
  return changes;
}

/** road_blocked: an unconfirmed closure on that road, through the same path as a closure event. */
async function closeRoad(event: Event, incidentId: string, p: z.infer<typeof incidentPayload>, text: string, step: (what: string) => Promise<unknown>): Promise<Change[]> {
  const named = text.match(/\b(?:on|at|near)\s+((?:[A-Z][\w'-]*\s?)+)/)?.[1]?.trim();
  const road = named ?? (p.coords ? `Road near ${p.coords[0].toFixed(3)}, ${p.coords[1].toFixed(3)}` : undefined);
  if (!road) return [];
  const res = await applyClosure({
    ...event, type: "closure", source: event.source === "person" ? "person" : event.source,
    payload: { road, state: "unconfirmed", reason: text, ...(p.coords ? { coords: p.coords } : {}) },
  });
  if (res.status === "rejected") return [];
  await step(`unconfirmed closure recorded on ${road}`);
  return res.changes;
}

// ---------- needs: one need per item and place (§5, §8.2, §8.7) ----------

async function applyNeed(event: Event): Promise<KeeperResult> {
  const parsed = needPayload.safeParse(event.payload);
  if (!parsed.success) return reject(`payload is not a valid need: ${firstIssue(parsed.error)}`);
  const p = parsed.data;
  const eventId = event._id!;
  const c = await cols();
  const site = p.siteId ? await c.sites.findOne({ _id: p.siteId, deskId: event.deskId }, { projection: { region: 1 } }) : null;
  if (p.siteId && !site) return reject(`site ${p.siteId} does not exist`);
  const region = p.region ?? site?.region ?? "unknown";
  const item = mask(p.item).trim();
  const trusted = isTrusted(await trustOf(event.actor));
  const now = new Date();
  const observedAt = event.observedAt ?? event.ts;

  const live = await c.needs.find({ deskId: event.deskId, status: { $nin: ["delivered", "cancelled"] } }).toArray();
  const same = matchNeed(live, item, region, p.siteId);

  if (!same) {
    const id = `need-${eventId}`;
    if (!(await c.needs.findOne({ _id: id }, { projection: { _id: 1 } }))) {
      const need: Need = {
        _id: id, item, quantity: p.quantity, region,
        siteIds: p.siteId ? [p.siteId] : [],
        status: needStatus(undefined, 1, trusted, p.lifeThreatening),
        history: [{ ...historyOf(event, `asked for ${p.quantity} ${item}`), ts: observedAt }],
        deskId: event.deskId,
        confidence: trusted ? "confirmed" : "unconfirmed",
        lifeThreatening: p.lifeThreatening,
        lines: [{ ...(p.siteId ? { siteId: p.siteId } : {}), quantity: p.quantity }],
        tier: p.lifeThreatening ? 0 : 1,
        ...scored({ support: 1, waitingSince: observedAt }, now),
        support: 1,
        requestedBy: [event.actor],
        caseNo: await nextCaseNo(event.deskId),
      };
      await insertOnce(() => c.needs.insertOne(need));
    }
    const status = (await c.needs.findOne({ _id: id }, { projection: { status: 1 } }))?.status;
    return done([id], `need for ${p.quantity} ${item} in ${region}, ${status}`,
      [{ recordType: "need", recordId: id, op: "created", eventId, fields: ["status", "quantity", "lines"] }], []);
  }

  const requestedBy = same.requestedBy.includes(event.actor) ? same.requestedBy : [...same.requestedBy, event.actor];
  const lines = mergeLines(same.lines, p.siteId, p.quantity);
  const life = same.lifeThreatening || p.lifeThreatening;
  const sup = requestedBy.length;
  const set: Partial<Need> = {
    requestedBy, lines, support: sup, lifeThreatening: life,
    quantity: lines.reduce((n, l) => n + l.quantity, 0),
    siteIds: p.siteId && !same.siteIds.includes(p.siteId) ? [...same.siteIds, p.siteId] : same.siteIds,
    status: needStatus(same.status, sup, trusted, life),
    confidence: trusted ? "confirmed" : same.confidence === "unconfirmed" && sup >= 3 ? "corroborated" : same.confidence,
    tier: life ? 0 : same.tier,
    ...scored({ support: sup, waitingSince: same.history[0]?.ts ?? observedAt }, now),
  };
  await c.needs.updateOne({ _id: same._id }, { $set: set, $push: { history: historyOf(event, `asked again for ${p.quantity} ${item}`) } });
  const fields = Object.keys(set).filter((k) => JSON.stringify(set[k as keyof Need]) !== JSON.stringify(same[k as keyof Need]));
  return done([same._id], `same need as ${same._id}, now ${set.quantity} ${same.item} for ${sup} ${sup === 1 ? "person" : "people"}, ${set.status}`,
    [{ recordType: "need", recordId: same._id, op: "updated", eventId, fields: [...fields, "history"] }], [], "merged");
}

// ---------- claims: "I am already doing this" ----------

async function applyClaim(event: Event): Promise<KeeperResult> {
  const parsed = claimPayload.safeParse(event.payload);
  if (!parsed.success) return reject(`payload is not a valid claim: ${firstIssue(parsed.error)}`);
  const p = parsed.data;
  if (!p.recordId) return reject("a claim must name the site or need it is about: ask the person which one");
  const c = await cols();
  const q = { _id: p.recordId, deskId: event.deskId };
  const site = await c.sites.findOne(q, { projection: { _id: 1 } });
  const need = site ? null : await c.needs.findOne(q, { projection: { _id: 1 } });
  if (!site && !need) return reject(`no site or need ${p.recordId} on this desk`);
  const recordType = site ? "site" : "need";
  const text = mask(p.textEn || p.text);
  const eta = p.etaMinutes !== undefined ? `, about ${p.etaMinutes} min` : "";
  const entry = historyOf(event, `${event.actor} is already on it (${p.what}${eta}): ${text}`);
  if (site) await c.sites.updateOne({ _id: site._id }, { $push: { history: entry } });
  else await c.needs.updateOne({ _id: need!._id }, { $push: { history: entry } });
  return done([p.recordId], entry.reason,
    [{ recordType, recordId: p.recordId, op: "updated", eventId: event._id!, fields: ["history"] }],
    [{ kind: "claim", type: p.what, recordType, recordId: p.recordId, deskId: event.deskId, by: event.actor, etaMinutes: p.etaMinutes, text }],
    "merged");
}

// ---------- group B: roads, shelters, zones, corrections ----------

/** Trust of whoever sent the event: a person's own record, system and nasa official, the sheet vetted, the rest public. */
async function eventTrust(event: Pick<Event, "source" | "actor">): Promise<Trust> {
  if (event.source === "person") return trustOf(event.actor);
  if (SYSTEM_SOURCES.has(event.source)) return "official";
  return event.source === "sheet" ? "vetted" : "public";
}

const stampOf = (event: Event, trust: Trust): Stamp => ({
  trust, observedAt: event.observedAt ?? event.ts, source: event.source,
  who: event.source === "person" ? event.actor : event.source,
});
const storedStamp = (r: { trust?: Trust; observedAt: Date; source?: Source }): Stamp => ({
  trust: r.trust ?? "public", observedAt: new Date(r.observedAt), source: r.source, who: r.source,
});
const confidenceOf = (t: Trust): Confidence => (t === "public" ? "unconfirmed" : "confirmed");
const hasEvent = (history: HistoryEntry[] | undefined, eventId: string) => Boolean(history?.some((h) => h.eventId === eventId));
const withEvent = (event: Event, reason: string): HistoryEntry => ({ ...historyOf(event, reason), eventId: event._id! });
const later = (a: Date, b: Date) => (new Date(a).getTime() >= b.getTime() ? new Date(a) : b);

/** The region of a place we only know by who told us or where it is: the sender's, else the nearest site's within 1 km. */
async function regionFor(event: Event, coords?: LatLng): Promise<string | undefined> {
  const { users, sites } = await cols();
  if (event.source === "person") {
    const u = await users.findOne({ _id: event.actor, deskId: event.deskId }, { projection: { region: 1 } });
    if (u?.region) return u.region;
  }
  if (!coords) return undefined;
  const near = (await sites.find({ deskId: event.deskId, coords: { $exists: true } }, { projection: { coords: 1, region: 1 } }).toArray())
    .map((s) => ({ region: s.region, m: haversineMeters(coords, s.coords!) }))
    .filter((s) => s.m <= 1000 && s.region !== "unknown")
    .sort((a, b) => a.m - b.m)[0];
  return near?.region;
}

// --- closure → roads (§8.3) ---

const roadKey = (name: string) => normalizeAddress(name) ?? normalizeText(name);
const closedLike = (state: Road["state"]) => state !== "open";

async function applyClosure(event: Event): Promise<KeeperResult> {
  const parsed = closurePayload.safeParse(event.payload);
  if (!parsed.success) return reject(`payload is not a valid closure: ${firstIssue(parsed.error)}`);
  const p = parsed.data;
  const eventId = event._id!;
  const c = await cols();
  const trust = await eventTrust(event);
  const stamp = stampOf(event, trust);
  const reason = mask(p.reason);
  const key = roadKey(p.road);

  const roads = await c.roads.find({ deskId: event.deskId }).toArray();
  const same = roads.find((r) => key && roadKey(r.road) === key)
    ?? (p.coords ? roads.find((r) => r.coords && haversineMeters(r.coords, p.coords!) <= 100) : undefined);

  if (!same) {
    const id = `road-${eventId}`;
    if (!(await c.roads.findOne({ _id: id }, { projection: { _id: 1 } }))) {
      const region = await regionFor(event, p.coords);
      const road: Road = {
        _id: id, road: mask(p.road).trim(), state: p.state, reason, ...(p.coords ? { coords: p.coords } : {}),
        ...(region ? { region } : {}),
        history: [withEvent(event, `${p.state}: ${reason || "no reason given"} (${stamp.who}, ${trust})`)],
        deskId: event.deskId, confidence: confidenceOf(trust), observedAt: stamp.observedAt, source: event.source, trust,
      };
      await insertOnce(() => c.roads.insertOne(road));
    }
    return done([id], `road ${p.road}: ${p.state}, new`,
      [{ recordType: "road", recordId: id, op: "created", eventId, fields: ["state", "reason", "confidence"], flags: closedLike(p.state) ? ["notify"] : [] }], []);
  }

  if (hasEvent(same.history, eventId)) return done([same._id], "already applied", [], [], "merged");
  const stored = storedStamp(same);
  let set: Partial<Road>;
  let note: string;
  let flags: Change["flags"] = [];
  if (closedLike(same.state) !== closedLike(p.state)) {
    const verdict = resolveConflict(stored, stamp);
    note = conflictNote(verdict, stored, same.state, stamp, p.state);
    if (verdict.winner === "incoming") {
      set = {
        state: p.state, reason: reason || same.reason, observedAt: stamp.observedAt, source: event.source, trust,
        confidence: confidenceOf(trust), ...(!same.coords && p.coords ? { coords: p.coords } : {}),
      };
      flags = ["notify"];
    } else set = {};
  } else if (trustRank(trust) >= trustRank(stored.trust)) {
    // Same story from someone at least as trusted: the record is refreshed and may firm up.
    note = `${p.state} again from ${stamp.who} (${trust})`;
    set = {
      state: p.state, reason: reason || same.reason, observedAt: later(stamp.observedAt, new Date(same.observedAt)),
      source: event.source, trust, confidence: confidenceOf(trust), ...(!same.coords && p.coords ? { coords: p.coords } : {}),
    };
  } else {
    note = `${p.state} also reported by ${stamp.who} (${trust}), the stored ${same.state} from ${stored.who ?? "unknown"} (${stored.trust}) stays`;
    set = { observedAt: later(stamp.observedAt, new Date(same.observedAt)) };
  }
  if (!same.region && !set.region) {
    const region = await regionFor(event, same.coords ?? p.coords);
    if (region) set.region = region;
  }
  await c.roads.updateOne({ _id: same._id, "history.eventId": { $ne: eventId } }, {
    ...(Object.keys(set).length ? { $set: set } : {}), $push: { history: withEvent(event, note) },
  });
  return done([same._id], `road ${same.road}: ${note}`,
    [{ recordType: "road", recordId: same._id, op: "updated", eventId, fields: [...Object.keys(set), "history"], flags, note }], [], "merged");
}

// --- capacity → shelters (§8.4) ---

const OVERFULL = 0.9;
const full = (used: number, total: number) => total > 0 && used / total > OVERFULL;

async function applyCapacity(event: Event): Promise<KeeperResult> {
  const parsed = capacityPayload.safeParse(event.payload);
  if (!parsed.success) return reject(`payload is not a valid capacity update: ${firstIssue(parsed.error)}`);
  const p = parsed.data;
  const eventId = event._id!;
  const c = await cols();
  const trust = await eventTrust(event);
  const stamp = stampOf(event, trust);
  const name = mask(p.shelter).trim();
  const value = `${p.bedsUsed}/${p.bedsTotal}`;
  const nameKey = normalizeText(p.shelter);

  const shelters = await c.shelters.find({ deskId: event.deskId }).toArray();
  const same = shelters.find((s) => s._id === p.shelter || (nameKey && normalizeText(s.name) === nameKey));

  if (!same) {
    const id = `shelter-${eventId}`;
    if (!(await c.shelters.findOne({ _id: id }, { projection: { _id: 1 } }))) {
      const shelter: Shelter = {
        _id: id, name, region: p.region ?? (await regionFor(event, p.coords)) ?? "unknown",
        ...(p.coords ? { coords: p.coords } : {}), bedsUsed: p.bedsUsed, bedsTotal: p.bedsTotal,
        updated: new Date(), observedAt: stamp.observedAt, source: event.source, trust,
        history: [withEvent(event, `${value} beds from ${stamp.who} (${trust})`)], deskId: event.deskId,
      };
      await insertOnce(() => c.shelters.insertOne(shelter));
    }
    return done([id], `shelter ${name}: ${value}, new`,
      [{ recordType: "shelter", recordId: id, op: "created", eventId, fields: ["bedsUsed", "bedsTotal"], flags: full(p.bedsUsed, p.bedsTotal) ? ["full"] : [] }], []);
  }

  if (hasEvent(same.history, eventId)) return done([same._id], "already applied", [], [], "merged");
  const stored = storedStamp(same);
  const storedValue = `${same.bedsUsed}/${same.bedsTotal}`;
  const flags: NonNullable<Change["flags"]> = [];
  let set: Partial<Shelter> = {};
  let note: string;
  let clash: string | undefined;
  if (storedValue !== value) {
    const verdict = resolveConflict(stored, stamp);
    note = conflictNote(verdict, stored, storedValue, stamp, value);
    if (trustedClash(stored, stamp)) {
      flags.push("confirm");
      clash = `${same.name}: ${stored.who ?? "one source"} (${stored.trust}) says ${storedValue}, ${stamp.who} (${trust}) says ${value}. Please confirm the real number.`;
    }
    if (verdict.winner === "incoming") {
      set = { bedsUsed: p.bedsUsed, bedsTotal: p.bedsTotal, observedAt: stamp.observedAt, updated: new Date(), source: event.source, trust };
      if (full(p.bedsUsed, p.bedsTotal) && !full(same.bedsUsed, same.bedsTotal)) flags.push("full");
    }
  } else {
    note = `${value} confirmed by ${stamp.who} (${trust})`;
    if (trustRank(trust) >= trustRank(stored.trust)) {
      set = { observedAt: later(stamp.observedAt, new Date(same.observedAt)), updated: new Date(), source: event.source, trust };
    }
  }
  // Where it is: filled in when the record does not know, never overwritten (v2.5).
  if (!same.coords && p.coords) set.coords = p.coords;
  if ((!same.region || same.region === "unknown") && p.region) set.region = p.region;
  await c.shelters.updateOne({ _id: same._id, "history.eventId": { $ne: eventId } }, {
    ...(Object.keys(set).length ? { $set: set } : {}), $push: { history: withEvent(event, note) },
  });
  return done([same._id], `shelter ${same.name}: ${note}`,
    [{ recordType: "shelter", recordId: same._id, op: "updated", eventId, fields: [...Object.keys(set), "history"], flags, ...(clash ? { note: clash } : {}) }], [], "merged");
}

// --- alert → zones (§8.5) ---

interface Shape { name?: string; region?: string; rings: number[][][][] }
let shapes: Map<string, Shape> | undefined;

/** The zone outlines from public/data/zones.geojson (read once). Polygon and MultiPolygon. */
async function shapeOf(zoneId: string): Promise<Shape | undefined> {
  if (!shapes) {
    shapes = new Map();
    try {
      const gj = JSON.parse(await readFile(new URL("../public/data/zones.geojson", import.meta.url), "utf8")) as {
        features: { id?: string; properties?: { _id?: string; name?: string; region?: string };
          geometry?: { type: string; coordinates: number[][][] | number[][][][] } }[];
      };
      for (const f of gj.features ?? []) {
        const id = f.id ?? f.properties?._id;
        if (!id || !f.geometry) continue;
        const rings = f.geometry.type === "Polygon" ? [f.geometry.coordinates as number[][][]]
          : f.geometry.type === "MultiPolygon" ? (f.geometry.coordinates as number[][][][]) : [];
        shapes.set(id, { name: f.properties?.name, region: f.properties?.region, rings });
      }
    } catch { /* no file: zones match by region only */ }
  }
  return shapes.get(zoneId);
}

const WARMTH = /blanket|tent|heater|heating|stove|sleeping bag|warm|coat|jacket|battaniye|cadir|çadır|soba|mont|isitici|ısıtıcı/i;
export const isWarmthItem = (item: string) => WARMTH.test(item);

const prettyZone = (id: string) => id.split(/[-_]/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

async function applyAlert(event: Event): Promise<KeeperResult> {
  const parsed = alertPayload.safeParse(event.payload);
  if (!parsed.success) return reject(`payload is not a valid alert: ${firstIssue(parsed.error)}`);
  const p = parsed.data;
  const eventId = event._id!;
  const c = await cols();
  const now = new Date();
  const shape = await shapeOf(p.zoneId);

  // The zone id is global in the collection. Another desk with the same id keeps its own zone.
  const zone0 = await c.zones.findOne({ deskId: event.deskId, _id: { $in: [p.zoneId, `${event.deskId}:${p.zoneId}`] } });
  if (zone0 && hasEvent(zone0.history, eventId)) return done([zone0._id], "already applied", [], [], "merged");

  const ev = p.evidence;
  const set: Partial<Zone> = p.kind === "silent_zone"
    ? { silentZone: true, ...(ev.damage !== undefined ? { damage: ev.damage } : {}), ...(ev.dark !== undefined ? { dark: ev.dark } : {}), ...(ev.calls !== undefined ? { calls: ev.calls } : {}) }
    : { cold: true, ...(ev.minTempC !== undefined ? { minTempC: ev.minTempC } : {}) };
  const note = p.kind === "silent_zone"
    ? `silent zone: damage ${ev.damage ?? "?"}, ${ev.dark === undefined ? "lights unknown" : ev.dark ? "power out" : "lights on"}, ${ev.calls ?? "?"} calls`
    : `cold night: ${ev.minTempC ?? "?"} °C`;
  let zone: Zone;
  let op: Change["op"];
  if (zone0) {
    await c.zones.updateOne({ _id: zone0._id, "history.eventId": { $ne: eventId } }, { $set: set, $push: { history: withEvent(event, note) } });
    zone = { ...zone0, ...set };
    op = "updated";
  } else {
    const taken = await c.zones.findOne({ _id: p.zoneId }, { projection: { deskId: 1 } });
    zone = {
      _id: taken && taken.deskId !== event.deskId ? `${event.deskId}:${p.zoneId}` : p.zoneId,
      name: shape?.name ?? prettyZone(p.zoneId), silentZone: false, damage: 0, dark: false, calls: 0, deskId: event.deskId,
      ...(shape?.region ? { region: shape.region } : {}), ...set, history: [withEvent(event, note)],
    };
    await insertOnce(() => c.zones.insertOne(zone));
    op = "created";
  }

  // Satellite data only raises a score, never lowers one.
  const inZone = (coords: LatLng | undefined, region: string) => coords && shape
    ? shape.rings.some((r) => pointInPolygon(coords, r))
    : !coords && Boolean(zone.region) && region === zone.region;
  const siteIdsIn = new Set(
    (await c.sites.find({ deskId: event.deskId, status: { $ne: "retracted" } }).toArray()).filter((s) => inZone(s.coords, s.region)).map((s) => s._id),
  );
  const changes: Change[] = [{
    recordType: "zone", recordId: zone._id, op, eventId, fields: Object.keys(set),
    flags: p.kind === "silent_zone" ? ["silent"] : [],
  }];
  const has = (parts: ScorePart[] | undefined, name: string) => parts?.some((x) => x.name === name) ?? false;

  if (p.kind === "silent_zone") {
    for (const s of await c.sites.find({ deskId: event.deskId, status: { $in: ["open", "team_on_site"] }, _id: { $in: [...siteIdsIn] } }).toArray()) {
      if (has(s.scoreParts, "silent zone")) continue;
      const next = scored({ support: s.support, waitingSince: new Date(s.observedAt), silentZone: true, warmthInCold: has(s.scoreParts, "cold night") }, now);
      await c.sites.updateOne({ _id: s._id }, { $set: next, $push: { history: withEvent(event, `silent zone ${zone.name}: priority +30`) } });
      changes.push({ recordType: "site", recordId: s._id, op: "updated", eventId, fields: ["priority", "scoreParts", "history"], flags: ["rescored"] });
    }
  }
  for (const n of await c.needs.find({ deskId: event.deskId, status: { $nin: ["delivered", "cancelled"] } }).toArray()) {
    const here = n.siteIds.some((id) => siteIdsIn.has(id)) || (Boolean(zone.region) && n.region === zone.region);
    const silent = p.kind === "silent_zone" && here && !has(n.scoreParts, "silent zone");
    const cold = p.kind === "cold" && here && isWarmthItem(n.item) && !has(n.scoreParts, "cold night");
    if (!silent && !cold) continue;
    const next = scored({
      support: n.support, waitingSince: new Date(n.history[0]?.ts ?? now),
      silentZone: silent || has(n.scoreParts, "silent zone"), warmthInCold: cold || has(n.scoreParts, "cold night"),
    }, now);
    await c.needs.updateOne({ _id: n._id }, {
      $set: next, $push: { history: withEvent(event, silent ? `silent zone ${zone.name}: priority +30` : `cold night in ${zone.name}: warmth need, priority +20`) },
    });
    changes.push({ recordType: "need", recordId: n._id, op: "updated", eventId, fields: ["priority", "scoreParts", "history"], flags: ["rescored"] });
  }
  return done([zone._id], `zone ${zone.name}: ${note}, ${changes.length - 1} record(s) raised`, changes, [], op === "created" ? "done" : "merged");
}

// --- correction: retract and edit (split and merge are out of scope) ---

const latLngSchema = z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]);
const EDITABLE = {
  site: {
    address: z.string().min(1).max(500), coords: latLngSchema, peopleTrapped: z.number().int().min(0).max(1_000_000),
  },
  need: { quantity: z.number().int().min(1).max(1_000_000) },
} as const;

async function applyCorrection(event: Event): Promise<KeeperResult> {
  const parsed = correctionPayload.safeParse(event.payload);
  if (!parsed.success) return reject(`payload is not a valid correction: ${firstIssue(parsed.error)}`);
  const p = parsed.data;
  const eventId = event._id!;
  if (event.source !== "person") return reject("only a person can correct a record");
  if (p.action !== "retract" && p.action !== "edit") {
    return reject(`a ${p.action} correction is not supported yet: ask a coordinator to fix it by hand`);
  }
  if (p.recordType !== "site" && p.recordType !== "need") {
    return reject(`a ${p.action} of a ${p.recordType} is not supported: only sites and needs can be corrected`);
  }
  const c = await cols();
  const q = { _id: p.recordId, deskId: event.deskId };
  const rec = p.recordType === "site" ? await c.sites.findOne(q) : await c.needs.findOne(q);
  if (!rec) return reject(`${p.recordType} ${p.recordId} not found on this desk`);
  if (hasEvent(rec.history, eventId)) return done([rec._id], "already applied", [], [], "merged");
  const why = mask(p.reason);
  const change = (fields: string[]): Change =>
    ({ recordType: p.recordType as "site" | "need", recordId: rec._id, op: "updated", eventId, fields: [...fields, "history"] });

  if (p.action === "retract") {
    const entry = withEvent(event, `retracted by ${event.actor}: ${why}`);
    if (p.recordType === "site") {
      if ((rec as Site).status === "retracted") return done([rec._id], "already retracted", [], [], "merged");
      await c.sites.updateOne({ ...q, status: { $ne: "retracted" } }, { $set: { status: "retracted" }, $push: { history: entry } });
    } else {
      const status = (rec as Need).status;
      if (status === "cancelled") return done([rec._id], "already cancelled", [], [], "merged");
      if (status === "delivered") return reject(`need ${rec._id} was already delivered, it cannot be retracted`);
      await c.needs.updateOne({ ...q, status: { $nin: ["cancelled", "delivered"] } }, { $set: { status: "cancelled" }, $push: { history: entry } });
    }
    return done([rec._id], `${p.recordType} ${rec._id} retracted by ${event.actor}: ${why}`, [change(["status"])],
      [{ kind: "cancel", recordType: p.recordType, recordId: rec._id, deskId: event.deskId, by: event.actor, reason: why }], "merged");
  }

  // edit: a short list of fields per record type, each checked, and the old value kept.
  const allowed: Record<string, z.ZodType> = EDITABLE[p.recordType];
  const asked = Object.entries(p.fields ?? {});
  if (!asked.length) return reject("an edit must say which fields to change");
  const bad = asked.filter(([k]) => !(k in allowed)).map(([k]) => k);
  if (bad.length) return reject(`cannot edit ${bad.join(", ")} on a ${p.recordType}: only ${Object.keys(allowed).join(", ")} can be edited`);
  const values: Record<string, unknown> = {};
  for (const [k, v] of asked) {
    const ok = allowed[k].safeParse(v);
    if (!ok.success) return reject(`${k} is not a valid value: ${ok.error.issues[0]?.message}`);
    values[k] = ok.data;
  }
  const current = rec as unknown as Record<string, unknown>;
  const changed = Object.keys(values).filter((k) => JSON.stringify(values[k]) !== JSON.stringify(current[k]));
  if (!changed.length) return done([rec._id], "nothing to change, the record already has these values", [], [], "merged");
  const arrow = changed.map((k) => `${k} ${JSON.stringify(current[k] ?? null)} → ${JSON.stringify(values[k])}`).join(", ");
  const entry = withEvent(event, `edited by ${event.actor}: ${arrow} (${why})`);
  const set: Record<string, unknown> = Object.fromEntries(changed.map((k) => [k, values[k]]));
  if (p.recordType === "site") {
    if ((rec as Site).status === "retracted") return reject(`site ${rec._id} is retracted, it cannot be edited`);
    if (changed.includes("peopleTrapped")) set.tier = siteTier(values.peopleTrapped as number, []);
    await c.sites.updateOne({ ...q, "history.eventId": { $ne: eventId } }, { $set: set, $push: { history: entry } });
  } else {
    const need = rec as Need;
    if (need.status === "delivered" || need.status === "cancelled") return reject(`need ${need._id} is ${need.status}, it cannot be edited`);
    if (need.lines.length > 1) return reject(`need ${need._id} has ${need.lines.length} lines: edit each by hand`);
    set.lines = need.lines.length ? [{ ...need.lines[0], quantity: values.quantity }] : need.lines;
    await c.needs.updateOne({ ...q, "history.eventId": { $ne: eventId } }, { $set: set, $push: { history: entry } });
  }
  return done([rec._id], entry.reason, [change(changed)], [], "merged");
}

// ---------- follow-ups the dispatcher asks for (records stay the keeper's) ----------

/** A deliver task went out with an owner: the need is assigned. */
export async function noteNeedAssigned(needId: string, taskId: string, assignee: string): Promise<boolean> {
  const { needs } = await cols();
  const r = await needs.updateOne({ _id: needId, status: "open" }, {
    $set: { status: "assigned" },
    $push: { history: { ts: new Date(), by: "dispatcher", source: "system", reason: `task ${taskId} to ${assignee}` } },
  });
  return r.modifiedCount > 0;
}

/**
 * Has a trusted source (official or vetted) reported on this site since `since`? Used before a
 * rejected rescue is proposed again. Reads only.
 */
export async function confirmedSince(siteId: string, since: Date): Promise<boolean> {
  const c = await cols();
  const site = await c.sites.findOne({ _id: siteId }, { projection: { sources: 1 } });
  if (!site?.sources.length) return false;
  const later = await c.events.find({ _id: { $in: site.sources.map((s) => s.eventId) }, ts: { $gt: since } }).toArray();
  for (const e of later) if (isTrusted(await eventTrust(e))) return true;
  return false;
}

/** The playbook ran: help is on the way, or nobody fits and a coordinator decides. */
export async function noteIncidentOutcome(incidentId: string, status: "helping" | "escalated", what: string, taskId?: string): Promise<void> {
  const { incidents } = await cols();
  await incidents.updateOne({ _id: incidentId, status: "open" }, {
    $set: { status },
    $push: { actions: { ts: new Date(), what, ...(taskId ? { taskId } : {}) } },
  });
}

/** One line of what the desk did about an incident. The same line is written once (a re-run adds nothing). */
export async function noteIncidentStep(incidentId: string, what: string, taskId?: string): Promise<void> {
  const { incidents } = await cols();
  await incidents.updateOne({ _id: incidentId, "actions.what": { $ne: what } }, {
    $push: { actions: { ts: new Date(), what, ...(taskId ? { taskId } : {}) } },
  });
}

/** The playbook is done: helping when every step found someone, else escalated. Only moves an open incident. */
export async function setIncidentStatus(incidentId: string, status: "helping" | "escalated"): Promise<void> {
  const { incidents } = await cols();
  await incidents.updateOne({ _id: incidentId, status: "open" }, { $set: { status } });
}

/**
 * Time passes: the "minutes waiting" part of the score grows. Recompute priority and scoreParts
 * of the open sites and needs (the satellite terms already on a record are kept) and write only
 * the records whose value changed. Returns them, for the dispatcher to copy onto their tasks.
 */
export async function refreshPriorities(now: Date, desk?: string): Promise<{ recordType: "site" | "need"; recordId: string; deskId: string; priority: number; scoreParts: ScorePart[] }[]> {
  const { sites, needs } = await cols();
  const out: { recordType: "site" | "need"; recordId: string; deskId: string; priority: number; scoreParts: ScorePart[] }[] = [];
  const keep = (parts?: ScorePart[]) => ({
    silentZone: parts?.some((p) => p.name === "silent zone") ?? false,
    warmthInCold: parts?.some((p) => p.name === "cold night") ?? false,
  });
  const scope = desk ? { deskId: desk } : {};
  const live = [
    ...(await sites.find({ ...scope, status: { $in: ["open", "team_on_site"] } }).toArray()).map((r) => ({ type: "site" as const, r, since: r.observedAt })),
    ...(await needs.find({ ...scope, status: { $nin: ["delivered", "cancelled"] } }).toArray()).map((r) => ({ type: "need" as const, r, since: r.history[0]?.ts ?? now })),
  ];
  for (const { type, r, since } of live) {
    const next = scored({ support: r.support, waitingSince: new Date(since), ...keep(r.scoreParts) }, now);
    if (next.priority === r.priority && JSON.stringify(next.scoreParts) === JSON.stringify(r.scoreParts)) continue;
    const coll = type === "site" ? sites : needs;
    const res = await (coll as typeof sites).updateOne({ _id: r._id, priority: r.priority }, { $set: next });
    if (res.modifiedCount) out.push({ recordType: type, recordId: r._id, deskId: r.deskId, ...next });
  }
  return out;
}

/** A proposed need opens when 3 different people ask (§5). Nobody else asked in this long: it is cancelled (§4 need lifecycle). */
export const PROPOSED_QUIET_MS = 2 * 3600_000;

/** Proposed needs whose last ask is older than PROPOSED_QUIET_MS go to cancelled. Returns them, for the dispatcher to tell the askers. */
export async function expireProposed(now: Date, desk?: string): Promise<Need[]> {
  const { needs } = await cols();
  const out: Need[] = [];
  for (const n of await needs.find({ ...(desk ? { deskId: desk } : {}), status: "proposed" }).toArray()) {
    const last = Math.max(...n.history.map((h) => new Date(h.ts).getTime()), 0);
    if (!last || now.getTime() - last < PROPOSED_QUIET_MS) continue;
    const r = await needs.updateOne({ _id: n._id, status: "proposed" }, {
      $set: { status: "cancelled" },
      $push: { history: { ts: now, by: "sweeper", source: "system", reason: `nobody else asked in ${PROPOSED_QUIET_MS / 3600_000} hours, cancelled` } },
    });
    if (r.modifiedCount) out.push(n);
  }
  return out;
}

// ---------- who said it ----------

const SYSTEM_SOURCES = new Set(["system", "nasa"]);

/**
 * One voice per reporter. A person is themselves. A social post has no known author in our
 * data, so its voice is its text: copies of one text are one voice, different words are another.
 * The text goes in as a short hash: voice keys are stored as `supporters`, and a raw post text
 * would carry phone numbers onto the board.
 */
async function voiceOf(e: Pick<Event, "_id" | "source" | "actor">, textKey?: string): Promise<Voice> {
  if (e.source === "person") return { key: `person:${e.actor}`, trust: await trustOf(e.actor) };
  if (SYSTEM_SOURCES.has(e.source)) return { key: `${e.source}:${e.actor}`, trust: "official" };
  const text = createHash("sha1").update(textKey ?? e._id ?? "").digest("hex").slice(0, 12);
  return { key: `${e.source}:${text}`, trust: "public" };
}

/** Who has posted about it, one entry per voice. `support` is its length (v2.2). */
function supportersOf(voices: Voice[]): string[] {
  return [...new Set(voices.map((v) => v.key))];
}

async function voicesOf(eventIds: string[]): Promise<Voice[]> {
  const { events } = await cols();
  const evs = await events
    .find({ _id: { $in: eventIds } }, { projection: { _id: 1, source: 1, actor: 1, result: 1 } })
    .toArray();
  return Promise.all(evs.map((e) => voiceOf(e, e.result?.textKey)));
}

const trustCache = new Map<string, { trust: Trust; at: number }>();
async function trustOf(userId: string): Promise<Trust> {
  const hit = trustCache.get(userId);
  if (hit && Date.now() - hit.at < 60_000) return hit.trust;
  const { users } = await cols();
  const user = await users.findOne({ _id: userId }, { projection: { trust: 1 } });
  const trust: Trust = user?.trust ?? "public";
  trustCache.set(userId, { trust, at: Date.now() });
  return trust;
}
