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
import { MongoServerError, type Filter } from "mongodb";
import { maskPhones } from "../agents/shared/privacy";
import { cols, getDb } from "../lib/db";
import { normalizeText } from "../lib/geo";
import { HAZARD_KINDS, severity } from "../lib/rules/incidents";
import { decideReport, type SiteLite } from "../lib/rules/merge";
import { isTrusted, matchNeed, mergeLines, needStatus } from "../lib/rules/needs";
import { confidence, scored, siteTier, support, type Voice } from "../lib/rules/priority";
import { answerPayload, approvalPayload, claimPayload, incidentPayload, needPayload, reportPayload } from "../lib/schemas";
import type {
  ClaimPayload, Event, EventType, HistoryEntry, Incident, Need, Post, RecordType, ReportPayload, Site,
  Trust,
} from "../lib/types";

/** Event types the keeper handles today. Others stay pending until their handler lands. */
export const HANDLED: EventType[] = ["report", "answer", "approval", "incident", "need", "claim"];

/** One record the keeper created or changed: what the dispatcher reacts to. */
export interface Change {
  recordType: RecordType;
  recordId: string;
  op: "created" | "updated";
  eventId: string;
  fields: string[];
}

/** What must happen to a task. The keeper decides it, the dispatcher (the tasks' writer) does it. */
export type TaskAction =
  | { kind: "accept"; taskId: string; by: string; etaMinutes?: number; progress?: "en_route" | "arrived"; note?: string }
  | { kind: "decline"; taskId: string; by: string; note?: string }
  | { kind: "done"; taskId: string; by: string; note?: string }
  | { kind: "approve"; taskId: string; by: string; assignee?: string }
  | { kind: "reject"; taskId: string; by: string }
  | { kind: "block"; taskId: string; by: string; incidentId: string; reason: string }
  | {
      kind: "claim"; type: ClaimPayload["what"]; recordType: "site" | "need"; recordId: string;
      deskId: string; by: string; etaMinutes?: number; text: string;
    };

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
    ? [{ recordType: "need", recordId: needId, op: "updated", eventId: event._id!, fields: [...Object.keys(set), "history"] }]
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
  if (p.assignee && !(await users.findOne({ _id: p.assignee, deskId: task.deskId }, { projection: { _id: 1 } }))) {
    return reject(`${p.assignee} is not a person on this desk`);
  }
  return done([task._id], `task ${task._id} approved by ${event.actor}${p.assignee ? `, send ${p.assignee} instead` : ""}`, [],
    [{ kind: "approve", taskId: task._id, by: event.actor, assignee: p.assignee }]);
}

// ---------- incidents: the help desk (§6) ----------

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
    const status: Incident["status"] = p.resolved ? "resolved" : inc.status;
    await c.incidents.updateOne({ _id: inc._id }, {
      $set: { status, canContinue: p.canContinue },
      $push: {
        history: historyOf(event, p.resolved ? `resolved: ${textEn}` : `update: ${textEn}`),
        actions: { ts: now, what: p.resolved ? `${event.actor} says it is over` : `update from ${event.actor}` },
      },
    });
    return done([inc._id], `incident ${inc._id} ${p.resolved ? "resolved" : "updated"}`,
      [{ recordType: "incident", recordId: inc._id, op: "updated", eventId, fields: ["status", "history", "actions"] }], [], "merged");
  }

  const task = p.taskId ? await c.tasks.findOne({ _id: p.taskId, deskId: event.deskId }) : null;
  const need = task?.recordType === "need" ? await c.needs.findOne({ _id: task.recordId }) : null;
  const me = await c.users.findOne({ _id: event.actor }, { projection: { role: 1 } });
  // Only the person on the task, or a coordinator, can stop it.
  const mayBlock = Boolean(task?.open && task.status !== "escalated" && (task.assignee === event.actor || me?.role === "coordinator"));
  const block = mayBlock && !p.canContinue;

  const id = `inc-${eventId}`;
  const changes: Change[] = [];
  if (!(await c.incidents.findOne({ _id: id }, { projection: { _id: 1 } }))) {
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
      history: [historyOf(event, textEn)],
      caseNo: await nextCaseNo(event.deskId),
    };
    await insertOnce(() => c.incidents.insertOne(incident));
  }
  changes.push({ recordType: "incident", recordId: id, op: "created", eventId, fields: ["status", "severity", "taskId"] });

  if (task && HAZARD_KINDS.includes(p.kind) && task.recordType === "site") {
    changes.push(...await moveSite(event, task.recordId, {}, { hazard: textEn }, `hazard: ${p.kind}`));
  }
  if (block && need) {
    // What did not arrive goes back to open. The dispatcher's replacement takes it from there.
    changes.push(...await moveNeed(event, need._id, ["assigned", "on_the_way"], { status: "open" }, `back to open: incident ${id}`));
  }
  return done([id, ...(task ? [task._id] : [])],
    `incident ${id} opened (${p.kind})${block ? `, task ${task!._id} blocked` : ""}`, changes,
    block ? [{ kind: "block", taskId: task!._id, by: event.actor, incidentId: id, reason: `${p.kind.replace(/_/g, " ")}: ${textEn}` }] : []);
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

// ---------- follow-ups the dispatcher asks for (records stay the keeper's) ----------

/** A deliver task went out with an owner: the need is assigned. */
export async function noteNeedAssigned(needId: string, taskId: string, assignee: string): Promise<void> {
  const { needs } = await cols();
  await needs.updateOne({ _id: needId, status: "open" }, {
    $set: { status: "assigned" },
    $push: { history: { ts: new Date(), by: "dispatcher", source: "system", reason: `task ${taskId} to ${assignee}` } },
  });
}

/** The playbook ran: help is on the way, or nobody fits and a coordinator decides. */
export async function noteIncidentOutcome(incidentId: string, status: "helping" | "escalated", what: string, taskId?: string): Promise<void> {
  const { incidents } = await cols();
  await incidents.updateOne({ _id: incidentId, status: "open" }, {
    $set: { status },
    $push: { actions: { ts: new Date(), what, ...(taskId ? { taskId } : {}) } },
  });
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
