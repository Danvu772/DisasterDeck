// Owned by Role 1. The dispatcher: reacts to what the memory keeper changed, and is the only
// writer of tasks and inboxes. Called from the Brain loop right after each event.
// Rules, no LLM (Final system design §5, decision 4):
//   1. The keeper's task actions first: accept, decline (next person), done, approve, reject,
//      block (a replacement goes out), claim.
//   2. A site not called yet, with no open call task → a call task, low risk, straight to the
//      nearest free volunteer.
//   3. A site verified with people still trapped, no open rescue task → a rescue task, high
//      risk, waiting for a coordinator, with the proposed field team named.
//   4. An open need with no open deliver task → a deliver task, low risk, to the nearest
//      supplier who has the item.
// Nobody fits: the task is escalated with the reason. Every task that gets a person writes one
// inbox item for them. Every approval writes one per coordinator. The one_open_task index keeps
// one open task per record and type, so a second run of the same event makes nothing new.
import { MongoServerError, type Filter } from "mongodb";
import { cols, newId } from "../lib/db";
import { distanceText, pickPerson, stockOf, type Pick, type Place } from "../lib/rules/assign";
import type { HistoryEntry, InboxItem, Need, Role, ScorePart, Site, Task, User } from "../lib/types";
import { noteIncidentOutcome, noteNeedAssigned, type Change, type TaskAction } from "./memory-keeper";

/** How long a person has to answer (N in §5, 2 in the demo). The board turns it red after. */
export const ANSWER_MINUTES = 2;
/** Three people said no: a coordinator decides. */
export const MAX_TRIES = 3;

const ROLE_FOR: Record<Task["type"], Role[]> = {
  call: ["volunteer"], rescue: ["field"], deliver: ["supplier"],
  assist: ["volunteer", "field"], notify: ["volunteer"], evacuate: ["field"],
};
const log = (...m: unknown[]) => console.log(`[dispatcher ${new Date().toISOString().slice(11, 19)}]`, ...m);
const entry = (reason: string, by = "dispatcher"): HistoryEntry =>
  ({ ts: new Date(), by, source: by === "dispatcher" ? "system" : "person", reason });
const deadline = (from: Date = new Date()) => new Date(from.getTime() + ANSWER_MINUTES * 60_000);

export async function react(changes: Change[], actions: TaskAction[] = []): Promise<void> {
  for (const a of actions) await act(a);
  for (const ch of changes) {
    if (ch.recordType === "site") await siteChanged(ch.recordId);
    else if (ch.recordType === "need") await needChanged(ch.recordId);
    else if (ch.recordType === "incident" && ch.op === "created") await incidentOpened(ch.recordId);
  }
}

// ---------- 1. what the keeper decided about a task ----------

async function act(a: TaskAction): Promise<void> {
  const { tasks } = await cols();
  if (a.kind === "claim") return claimed(a);
  const task = await tasks.findOne({ _id: a.taskId });
  if (!task) return;

  switch (a.kind) {
    case "accept": {
      const eta = a.etaMinutes !== undefined ? new Date(Date.now() + a.etaMinutes * 60_000) : task.eta;
      const step = a.progress === "arrived" ? "arrived" : a.progress === "en_route" ? "on the way" : "";
      await tasks.updateOne({ _id: task._id, status: { $in: ["assigned", "accepted"] } }, {
        $set: { status: "accepted", ...(eta ? { eta } : {}), ...(a.progress ? { progress: a.progress } : {}) },
        // A new promised time is a new answer: the sweeper may check in again after it.
        ...(a.etaMinutes !== undefined ? { $unset: { checkinAt: "" } } : {}),
        $push: { history: entry(["accepted", step, a.etaMinutes !== undefined ? `about ${a.etaMinutes} min` : "", a.note ?? ""].filter(Boolean).join(", "), a.by) },
      });
      return;
    }
    case "done":
      await tasks.updateOne({ _id: task._id, open: true }, {
        $set: { status: "done", open: false },
        $push: { history: entry(a.note ? `done: ${a.note}` : "done", a.by) },
      });
      return;
    case "reject":
      await tasks.updateOne({ _id: task._id, status: "waiting_approval" }, {
        $set: { status: "cancelled", open: false },
        $push: { history: entry("rejected by the coordinator", a.by) },
      });
      return;
    case "approve":
      return approved(task, a.by, a.assignee);
    case "decline":
      return declined(task, a.by, a.note);
    case "block":
      return blocked(task, a.by, a.incidentId, a.reason);
  }
}

/** Same task, next person. Never the same person twice, a coordinator after three. */
async function declined(task: Task, by: string, note?: string): Promise<void> {
  const said = entry(note ? `declined: ${note}` : "declined", by);
  await handOver(task, by, said, new Date(), { status: { $in: ["assigned", "accepted"] } });
}

/**
 * The sweeper's "no answer": the deadline passed on an assigned task. The person goes into
 * `tried` and the task moves on exactly like a decline. A conditional update, so a second tick
 * (or a second Brain) handles each task once. `now` also starts the next person's clock.
 */
export async function timedOut(task: Task, now: Date = new Date()): Promise<void> {
  if (!task.assignee) return;
  const said = entry(`timed out, no answer from ${task.assignee} in ${ANSWER_MINUTES} min`);
  await handOver(task, task.assignee, said, now, { status: "assigned", deadline: { $lt: now } });
}

async function handOver(task: Task, by: string, said: HistoryEntry, now: Date, guard: Filter<Task>): Promise<void> {
  const { tasks } = await cols();
  const tried = task.tried.includes(by) ? task.tried : [...task.tried, by];
  const pick: Pick = tried.length >= MAX_TRIES
    ? { ok: false, reason: `${tried.length} people said no or did not answer` }
    : await pickFor(task, tried, now);
  const r = await tasks.updateOne({ _id: task._id, assignee: by, ...guard }, pick.ok
    ? {
        $set: { status: "assigned", assignee: pick.user._id, tried, deadline: deadline(now) },
        $unset: { eta: "", progress: "", checkinAt: "" },
        $push: { history: { $each: [said, entry(`reassigned to ${pick.user._id}${near(pick)}`)] } },
      }
    : {
        $set: { status: "escalated", tried, deadline: deadline(now) },
        $unset: { assignee: "", eta: "", progress: "", checkinAt: "" },
        $push: { history: { $each: [said, entry(`escalated, ${pick.reason}`)] } },
      });
  if (!r.modifiedCount) return;
  if (pick.ok) await inboxTask({ ...task, assignee: pick.user._id });
  else await inboxCoordinators(task, "notice", `Nobody took this task: ${task.title}. ${cap(pick.reason)}.`);
}

/**
 * The promised time passed on an accepted task: one check-in to the assignee, once. The
 * `checkinAt` field is the record of it (and the sweeper's clock for "unreachable").
 */
export async function checkIn(task: Task, now: Date = new Date()): Promise<boolean> {
  if (!task.assignee) return false;
  const { tasks } = await cols();
  const r = await tasks.updateOne(
    { _id: task._id, assignee: task.assignee, status: "accepted", eta: { $lt: now }, checkinAt: { $exists: false } },
    { $set: { checkinAt: now }, $push: { history: entry(`check-in sent to ${task.assignee}, the promised time passed`) } },
  );
  if (!r.modifiedCount) return false;
  await inbox([{
    userId: task.assignee, taskId: task._id, kind: "checkin", priority: task.priority,
    message: `Still on your way? ${task.title}. Please answer so the desk knows.`,
  }]);
  return true;
}

/** Time moved on: copy the records' new priority onto their open tasks. Only what differs. */
export async function syncPriority(changes: { recordId: string; priority: number; scoreParts: ScorePart[] }[]): Promise<number> {
  const { tasks } = await cols();
  let n = 0;
  for (const c of changes) {
    const r = await tasks.updateMany({ recordId: c.recordId, open: true, priority: { $ne: c.priority } },
      { $set: { priority: c.priority, scoreParts: c.scoreParts } });
    n += r.modifiedCount;
  }
  return n;
}

/** The coordinator said yes: the person they named, or the proposed team, or the nearest free one now. */
async function approved(task: Task, by: string, assignee?: string): Promise<void> {
  const { tasks, users } = await cols();
  let pick: Pick;
  if (assignee) {
    const u = await users.findOne({ _id: assignee });
    pick = u ? { ok: true, user: u } : { ok: false, reason: `${assignee} is not on the desk` };
  } else {
    const proposed = proposedIn(task.detail);
    const u = proposed ? await users.findOne({ _id: proposed, deskId: task.deskId }) : null;
    pick = u ? { ok: true, user: u } : await pickFor(task, task.tried);
  }
  const why = assignee ? `approved by ${by}, sent ${assignee} instead` : `approved by ${by}`;
  const r = await tasks.updateOne({ _id: task._id, status: "waiting_approval" }, pick.ok
    ? { $set: { status: "assigned", assignee: pick.user._id, deadline: deadline() }, $push: { history: entry(`${why}, assigned to ${pick.user._id}`, by) } }
    : { $set: { status: "escalated", deadline: deadline() }, $push: { history: entry(`${why}, then escalated: ${pick.reason}`, by) } });
  if (r.modifiedCount && pick.ok) await inboxTask({ ...task, assignee: pick.user._id });
}

/** An incident stopped the task: block it, and send a replacement to the next person (§6). */
async function blocked(task: Task, by: string, incidentId: string, reason: string): Promise<void> {
  const { tasks } = await cols();
  const tried = task.assignee && !task.tried.includes(task.assignee) ? [...task.tried, task.assignee] : task.tried;
  const r = await tasks.updateOne({ _id: task._id, open: true }, {
    $set: { status: "blocked", open: false, blockedBy: incidentId, tried },
    $push: { history: entry(`blocked by incident ${incidentId}, ${reason}`, by) },
  });
  if (!r.modifiedCount) return;

  const made = await createTask({ ...task, tried }, { replaces: task._id, why: `replaces task ${task._id}, blocked by incident ${incidentId}` });
  if (!made) {
    await noteIncidentOutcome(incidentId, "escalated", `task ${task._id} blocked, a replacement could not be made`);
    return;
  }
  const helped = made.status === "assigned" || made.status === "waiting_approval";
  await noteIncidentOutcome(incidentId, helped ? "helping" : "escalated",
    made.status === "assigned" ? `task ${task._id} blocked, replacement ${made._id} sent to ${made.assignee}`
      : made.status === "waiting_approval" ? `task ${task._id} blocked, replacement ${made._id} waits for a coordinator`
        : `task ${task._id} blocked, replacement ${made._id} escalated: nobody fits`,
    made._id);
}

/** "I am already doing this": the work becomes a task in that person's name, accepted. */
async function claimed(a: Extract<TaskAction, { kind: "claim" }>): Promise<void> {
  const { tasks } = await cols();
  if (await tasks.findOne({ recordId: a.recordId, type: a.type, open: true }, { projection: { _id: 1 } })) return;
  const rec = await recordOf(a.recordType, a.recordId);
  if (!rec) return;
  const eta = a.etaMinutes !== undefined ? new Date(Date.now() + a.etaMinutes * 60_000) : undefined;
  await insertTask({
    _id: newId(), type: a.type, recordType: a.recordType, recordId: a.recordId, assignee: a.by,
    tried: [], risk: a.type === "rescue" ? "high" : "low",
    tier: rec.tier, priority: rec.priority, ...(rec.scoreParts ? { scoreParts: rec.scoreParts } : {}),
    status: "accepted", open: true,
    title: titleFor(a.type, rec), detail: `Declared by ${a.by}: ${a.text}`,
    deadline: deadline(), ...(eta ? { eta } : {}),
    history: [entry(`claimed by ${a.by}`, a.by)], deskId: a.deskId,
  });
}

// ---------- 2 to 4. records that need someone to act ----------

async function siteChanged(siteId: string): Promise<void> {
  const { sites } = await cols();
  const site = await sites.findOne({ _id: siteId });
  if (!site || site.status === "retracted" || site.status === "closed") return;
  if (site.callStatus === "not_called" && site.status === "open") {
    await createFor("call", "site", site);
  }
  if (site.callStatus === "verified" && site.peopleTrapped > 0 && site.status !== "team_on_site") {
    await createFor("rescue", "site", site);
  }
}

async function needChanged(needId: string): Promise<void> {
  const { needs } = await cols();
  const need = await needs.findOne({ _id: needId });
  if (need?.status === "open") await createFor("deliver", "need", need);
}

async function incidentOpened(incidentId: string): Promise<void> {
  const { incidents } = await cols();
  const inc = await incidents.findOne({ _id: incidentId });
  if (!inc) return;
  const users = await peopleOn(inc.deskId, ["coordinator"]);
  await inbox(users.map((u) => ({
    userId: u._id, kind: "incident", incidentId: inc._id, ...(inc.taskId ? { taskId: inc.taskId } : {}),
    priority: inc.severity === "critical" ? 100 : inc.severity === "high" ? 50 : 10,
    message: `Problem${inc.caseNo ? ` ${inc.caseNo}` : ""}, ${inc.severity}: ${inc.kind.replace(/_/g, " ")}. ${inc.textEn}`,
  })));
}

async function createFor(type: Task["type"], recordType: "site" | "need", rec: Site | Need): Promise<void> {
  const { tasks } = await cols();
  if (await tasks.findOne({ recordId: rec._id, type, open: true }, { projection: { _id: 1 } })) return;
  const risk = type === "rescue" ? "high" : "low";
  await createTask({
    _id: "", type, recordType, recordId: rec._id, tried: [], risk,
    tier: rec.tier, priority: rec.priority, ...(rec.scoreParts ? { scoreParts: rec.scoreParts } : {}),
    status: "created", open: true, title: titleFor(type, rec), detail: "", deadline: deadline(),
    history: [], deskId: rec.deskId,
  }, { why: whyFor(type, rec) });
}

/**
 * Make one task from a template (a fresh one, or the blocked task it replaces): pick a person,
 * set the status from the risk, insert, and tell whoever has to act. Null when one is open already.
 */
async function createTask(from: Task, opts: { why: string; replaces?: string }): Promise<Task | null> {
  const rec = await recordOf(from.recordType as "site" | "need", from.recordId);
  if (!rec) return null;
  const pick = await pickFor(from, from.tried);
  const base: Task = {
    ...from,
    _id: newId(),
    detail: opts.replaces ? from.detail : detailFor(from.type, rec),
    tried: from.tried,
    open: true,
    deadline: deadline(),
    history: [entry(opts.why)],
    ...(opts.replaces ? { replaces: opts.replaces } : {}),
  };
  delete base.assignee; delete base.eta; delete base.progress; delete base.blockedBy;
  let task: Task;
  if (!pick.ok) {
    task = { ...base, status: "escalated", history: [...base.history, entry(`escalated, ${pick.reason}`)] };
  } else if (from.risk === "high") {
    // A coordinator decides first (§5). The team is only proposed, it gets nothing yet.
    const team = `Proposed team: ${pick.user.name} (${pick.user._id})${pick.meters !== undefined ? `, ${distanceText(pick.meters)} away` : ""}.`;
    const detail = `${stripProposal(base.detail)} ${team}`.trim();
    task = { ...base, status: "waiting_approval", detail, history: [...base.history, entry(`waiting for a coordinator, ${team}`)] };
  } else {
    task = { ...base, status: "assigned", assignee: pick.user._id, history: [...base.history, entry(`assigned to ${pick.user._id}${near(pick)}`)] };
  }
  if (!(await insertTask(task))) return null;

  if (task.status === "assigned") {
    await inboxTask(task);
    if (task.type === "deliver") await noteNeedAssigned(task.recordId, task._id, task.assignee!);
  } else if (task.status === "waiting_approval") {
    await inboxCoordinators(task, "approval", `Approve: ${task.title}. ${task.detail}`);
  } else {
    await inboxCoordinators(task, "notice", `Nobody fits: ${task.title}. ${cap(pick.ok ? "" : pick.reason)}.`);
  }
  log(`${task.type} task ${task._id} for ${task.recordId}: ${task.status}${task.assignee ? ` to ${task.assignee}` : ""}`);
  return task;
}

async function insertTask(task: Task): Promise<boolean> {
  const { tasks } = await cols();
  try {
    await tasks.insertOne(task);
    return true;
  } catch (err) {
    // one_open_task: this record already has an open task of this type (a second run, or a race).
    if (err instanceof MongoServerError && err.code === 11000) return false;
    throw err;
  }
}

// ---------- who ----------

async function peopleOn(desk: string, roles: Role[]): Promise<User[]> {
  const { users } = await cols();
  return users.find({ deskId: desk, role: { $in: roles } }).toArray();
}

async function pickFor(task: Task, tried: string[], now: Date = new Date()): Promise<Pick> {
  const { tasks } = await cols();
  const roles = ROLE_FOR[task.type];
  const users = await peopleOn(task.deskId, roles);
  const counts = await tasks.aggregate<{ _id: string; n: number }>([
    { $match: { deskId: task.deskId, open: true, assignee: { $in: users.map((u) => u._id) } } },
    { $group: { _id: "$assignee", n: { $sum: 1 } } },
  ]).toArray();
  const rec = await recordOf(task.recordType as "site" | "need", task.recordId);
  const place: Place = rec && "coords" in rec ? { coords: rec.coords, region: rec.region } : { region: rec?.region ?? "unknown" };
  const item = rec && "item" in rec ? rec.item : undefined;
  return pickPerson(users, new Map(counts.map((c) => [c._id, c.n])), place, {
    roles, exclude: tried,
    ...(task.type === "deliver" && item ? { has: (u: User) => stockOf(u, item) > 0, what: `${item} in stock` } : {}),
  }, now);
}

async function recordOf(type: "site" | "need", id: string): Promise<Site | Need | null> {
  const { sites, needs } = await cols();
  return type === "site" ? sites.findOne({ _id: id }) : needs.findOne({ _id: id });
}

// ---------- inboxes ----------

async function inbox(items: Omit<InboxItem, "_id" | "status" | "ts">[]): Promise<void> {
  if (!items.length) return;
  const { inbox } = await cols();
  const ts = new Date();
  await inbox.insertMany(items.map((i) => ({ ...i, _id: newId(), status: "unread" as const, ts })));
}

async function inboxTask(task: Task): Promise<void> {
  if (!task.assignee) return;
  await inbox([{ userId: task.assignee, taskId: task._id, kind: "task", priority: task.priority, message: `${task.title}. ${task.detail}` }]);
}

async function inboxCoordinators(task: Task, kind: "approval" | "notice", message: string): Promise<void> {
  const users = await peopleOn(task.deskId, ["coordinator"]);
  await inbox(users.map((u) => ({ userId: u._id, taskId: task._id, kind, priority: task.priority, message })));
}

// ---------- words ----------

const where = (rec: Site | Need) => ("address" in rec ? rec.address : rec.region);

function titleFor(type: Task["type"], rec: Site | Need): string {
  if ("item" in rec) return `Bring ${rec.quantity} ${rec.item} to ${rec.region}`;
  const n = rec.caseNo ? `site ${rec.caseNo}` : where(rec);
  switch (type) {
    case "call": return `Call about ${n}, ${rec.address}`;
    case "rescue": return `Rescue at ${n}, ${rec.address}`;
    default: return `${cap(type)} at ${n}, ${rec.address}`;
  }
}

function detailFor(type: Task["type"], rec: Site | Need): string {
  if ("item" in rec) {
    const lines = rec.lines.length > 1 ? ` In ${rec.lines.length} lines: ${rec.lines.map((l) => `${l.quantity} for ${l.siteId ?? rec.region}`).join(", ")}.` : "";
    return `${rec.requestedBy.length} ${rec.requestedBy.length === 1 ? "person asked" : "people asked"}${rec.lifeThreatening ? ", danger to life" : ""}.${lines}`;
  }
  const people = rec.peopleTrapped === 1 ? "1 person trapped" : `${rec.peopleTrapped} people trapped`;
  const reports = `${rec.support} ${rec.support === 1 ? "report" : "reports"}, ${rec.confidence}`;
  if (type === "call") return `${people}, ${reports}. Call to check the address and who is inside.`;
  return `${people}, verified by a call. ${reports}.${rec.hazard ? ` Hazard: ${rec.hazard}.` : ""}`;
}

function whyFor(type: Task["type"], rec: Site | Need): string {
  if (type === "call") return "nobody has called about this site yet";
  if (type === "rescue") return `verified, ${(rec as Site).peopleTrapped} still trapped`;
  return `open need, ${(rec as Need).support} asked`;
}

// The proposal is written into the detail in one fixed shape, so an approval can find it again.
const PROPOSAL = /\s*Proposed team: .*\(([^()]+)\)(, [^.]* away)?\.$/;
const proposedIn = (detail: string) => detail.match(PROPOSAL)?.[1];
const stripProposal = (detail: string) => detail.replace(PROPOSAL, "");
const near = (p: Pick) => (p.ok && p.meters !== undefined ? `, ${distanceText(p.meters)} away` : "");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
