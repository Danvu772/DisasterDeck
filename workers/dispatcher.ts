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
//   5. High risk is a rescue, a deliver of BIG_SUPPLY_MOVE or more, and an evacuation plan (one
//      evacuate task, approved by a coordinator, no field team). A deliver goes to a supplier whose
//      stock covers the quantity, else the one with the most, and says so.
//   6. The people who asked hear when their need moves. A rescue a coordinator rejected is only
//      proposed again after something material changed.
// Nobody fits: the task is escalated with the reason. Every task that gets a person writes one
// inbox item for them. Every approval writes one per coordinator. The one_open_task index keeps
// one open task per record and type, so a second run of the same event makes nothing new.
import { MongoServerError, type Filter } from "mongodb";
import { cols, newId } from "../lib/db";
import { haversineMeters } from "../lib/geo";
import { distanceText, pickPerson, stockOf, type Pick, type Place } from "../lib/rules/assign";
import type { HistoryEntry, InboxItem, Need, Role, ScorePart, Site, Task, User } from "../lib/types";
import { confirmedSince, noteIncidentOutcome, noteNeedAssigned, type Change, type TaskAction } from "./memory-keeper";

/** How long a person has to answer (N in §5, 2 in the demo). The board turns it red after. */
export const ANSWER_MINUTES = 2;
/** Three people said no: a coordinator decides. */
export const MAX_TRIES = 3;
/** A deliver task for this many items or more is a big supply move: high risk, a coordinator decides. */
export const BIG_SUPPLY_MOVE = 100;

const ROLE_FOR: Record<Task["type"], Role[]> = {
  call: ["volunteer"], rescue: ["field"], deliver: ["supplier"],
  assist: ["volunteer", "field"], notify: ["volunteer"], evacuate: ["field"],
};
const log = (...m: unknown[]) => console.log(`[dispatcher ${new Date().toISOString().slice(11, 19)}]`, ...m);
const entry = (reason: string, by = "dispatcher"): HistoryEntry =>
  ({ ts: new Date(), by, source: by === "dispatcher" ? "system" : "person", reason });
const deadline = (from: Date = new Date()) => new Date(from.getTime() + ANSWER_MINUTES * 60_000);

export async function react(changes: Change[], actions: TaskAction[] = []): Promise<void> {
  // A failed delivery goes back to open before the replacement takes it: the askers hear "delayed" first.
  for (const ch of changes) if (ch.recordType === "need" && ch.toStatus === "open") await tellAskers(ch.recordId, "open", ch.eventId);
  for (const a of actions) await act(a);
  for (const ch of changes) {
    if (ch.recordType === "site") await siteChanged(ch.recordId);
    else if (ch.recordType === "need") await needChanged(ch);
    else if (ch.recordType === "incident" && ch.op === "created") await incidentOpened(ch.recordId);
    else if (ch.recordType === "road") { if (ch.flags?.includes("notify")) await roadChanged(ch); }
    else if (ch.recordType === "shelter") await shelterChanged(ch);
    else if (ch.recordType === "zone" && ch.flags?.includes("silent")) await silentZone(ch.recordId);
    if ((ch.recordType === "site" || ch.recordType === "need") && ch.flags?.includes("rescored")) {
      await syncRecordPriority(ch.recordType, ch.recordId);
    }
  }
}

// ---------- 1. what the keeper decided about a task ----------

async function act(a: TaskAction): Promise<void> {
  const { tasks } = await cols();
  if (a.kind === "claim") return claimed(a);
  if (a.kind === "cancel") return cancelled(a);
  if (a.kind === "plan") return planned(a);
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
    case "reject": {
      // The number of people trapped is written down, so a later change can tell if anything is new (item "re-propose").
      const trapped = task.type === "rescue" && task.recordType === "site"
        ? (await (await cols()).sites.findOne({ _id: task.recordId }, { projection: { peopleTrapped: 1 } }))?.peopleTrapped : undefined;
      const r = await tasks.updateOne({ _id: task._id, status: "waiting_approval" }, {
        $set: { status: "cancelled", open: false },
        $push: { history: entry(`rejected by the coordinator${trapped !== undefined ? `, ${trapped} trapped` : ""}`, a.by) },
      });
      if (r.modifiedCount) await closeApprovals(task._id);
      return;
    }
    case "approve":
      return approved(task, a.by, a.assignee, a.eventId);
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

/** Why this person cannot take this task, or null. The coordinator may pick anyone who is able. */
async function whyNot(u: User, task: Task): Promise<string | null> {
  if (!ROLE_FOR[task.type].includes(u.role)) return `${u._id} cannot take a ${task.type} task: wrong role`;
  if (u.status === "offline") return `${u._id} cannot take a ${task.type} task: offline`;
  if (task.type === "deliver") {
    const need = await recordOf("need", task.recordId);
    if (need && "item" in need && stockOf(u, need.item) <= 0) return `${u._id} cannot take a deliver task: no ${need.item} in stock`;
  }
  return null;
}

/** The coordinator said yes: the person they named, or the proposed team, or the nearest free one now. */
async function approved(task: Task, by: string, assignee?: string, eventId?: string): Promise<void> {
  const { tasks, users } = await cols();
  if (task.type === "evacuate") {
    // No field team: the keeper set the exits, the task is done.
    const r = await tasks.updateOne({ _id: task._id, status: "waiting_approval" }, {
      $set: { status: "done", open: false }, $push: { history: entry(`approved by ${by}, the exits are set on the zones`, by) },
    });
    if (r.modifiedCount) await closeApprovals(task._id);
    return;
  }
  let pick: Pick;
  if (assignee) {
    const u = await users.findOne({ _id: assignee, deskId: task.deskId });
    const problem = u ? await whyNot(u, task) : `${assignee} is not on the desk`;
    if (problem) {
      // Not sent: the task keeps waiting, and the coordinator is told why.
      const r = await tasks.updateOne({ _id: task._id, status: "waiting_approval", ...(eventId ? { "history.eventId": { $ne: eventId } } : {}) },
        { $push: { history: { ...entry(`approval by ${by} not carried out: ${problem}`, by), ...(eventId ? { eventId } : {}) } } });
      if (r.modifiedCount) {
        await inbox([{
          userId: by, taskId: task._id, kind: "notice", priority: task.priority, ...(eventId ? { key: `approve-refused:${eventId}` } : {}),
          message: `Not sent: ${problem}. The task is still waiting for you: ${task.title}.`,
        }]);
      }
      return;
    }
    pick = { ok: true, user: u! };
  } else {
    const proposed = proposedIn(task.detail);
    const u = proposed ? await users.findOne({ _id: proposed, deskId: task.deskId }) : null;
    pick = u ? { ok: true, user: u } : await pickFor(task, task.tried);
  }
  const why = assignee ? `approved by ${by}, sent ${assignee} instead` : `approved by ${by}`;
  const r = await tasks.updateOne({ _id: task._id, status: "waiting_approval" }, pick.ok
    ? { $set: { status: "assigned", assignee: pick.user._id, deadline: deadline() }, $push: { history: entry(`${why}, assigned to ${pick.user._id}${near(pick)}`, by) } }
    : { $set: { status: "escalated", deadline: deadline() }, $push: { history: entry(`${why}, then escalated: ${pick.reason}`, by) } });
  if (!r.modifiedCount) return;
  await closeApprovals(task._id);
  if (pick.ok) {
    await inboxTask({ ...task, assignee: pick.user._id });
    if (task.type === "deliver" && await noteNeedAssigned(task.recordId, task._id, pick.user._id)) await tellAskers(task.recordId, "assigned", task._id);
  }
}

/** One coordinator decided: the others must not act on it. Their unread approval items are read. */
async function closeApprovals(taskId: string): Promise<void> {
  const { inbox } = await cols();
  await inbox.updateMany({ taskId, kind: "approval", status: "unread" }, { $set: { status: "read" } });
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
    const gate = await rescueGate(site);
    if (gate.go) await createFor("rescue", "site", site, gate.why);
  }
}

/**
 * A rescue a coordinator rejected is proposed again only when something material changed since:
 * more people trapped than then, or a confirmed (official or vetted) report after it. The reason
 * goes into the rejected task's history either way.
 */
async function rescueGate(site: Site): Promise<{ go: boolean; why?: string }> {
  const { tasks } = await cols();
  if (await tasks.findOne({ recordId: site._id, type: "rescue", open: true }, { projection: { _id: 1 } })) return { go: false };
  let last: { task: Task; ts: Date; trapped?: number } | undefined;
  for (const t of await tasks.find({ recordId: site._id, type: "rescue", status: "cancelled" }).toArray()) {
    for (const h of t.history) {
      if (!/^rejected by the coordinator/.test(h.reason)) continue;
      if (!last || new Date(h.ts) > last.ts) last = { task: t, ts: new Date(h.ts), trapped: Number(h.reason.match(/(\d+) trapped/)?.[1] ?? NaN) };
    }
  }
  if (!last) return { go: true };
  const was = last.trapped !== undefined && !Number.isNaN(last.trapped) ? last.trapped : undefined;
  const more = was !== undefined && site.peopleTrapped > was;
  if (more) return { go: true, why: `proposed again after a rejection: ${site.peopleTrapped} trapped now, ${was} then` };
  if (await confirmedSince(site._id, last.ts)) return { go: true, why: "proposed again after a rejection: a confirmed report arrived since" };
  const note = `not proposed again: nothing new since the rejection (${site.peopleTrapped} trapped now${was !== undefined ? `, ${was} then` : ""}, no confirmed report after it)`;
  await tasks.updateOne({ _id: last.task._id, "history.reason": { $ne: note } }, { $push: { history: entry(note) } });
  return { go: false };
}

async function needChanged(ch: Change): Promise<void> {
  const { needs } = await cols();
  const need = await needs.findOne({ _id: ch.recordId });
  if (need?.status === "open") await createFor("deliver", "need", need);
  if (ch.toStatus === "on_the_way" || ch.toStatus === "delivered") await tellAskers(ch.recordId, ch.toStatus, ch.eventId);
}

/** The people who asked hear when their need moves: one notice each, once per status change. */
async function tellAskers(needId: string, status: "assigned" | "on_the_way" | "delivered" | "open", change: string): Promise<void> {
  const { needs, sites, tasks } = await cols();
  const need = await needs.findOne({ _id: needId });
  if (!need?.requestedBy.length) return;
  const site = need.siteIds[0] ? await sites.findOne({ _id: need.siteIds[0] }, { projection: { caseNo: 1 } }) : null;
  const what = `${cap(need.item)} for ${site?.caseNo ? `site ${site.caseNo}` : need.region}`;
  let how: string;
  if (status === "assigned") how = "a supplier has been found";
  else if (status === "delivered") how = "delivered";
  else if (status === "open") how = "delayed, a new supplier is being found";
  else {
    const eta = (await tasks.findOne({ recordId: need._id, type: "deliver", open: true }, { projection: { eta: 1 } }))?.eta;
    const min = eta ? Math.max(1, Math.round((new Date(eta).getTime() - Date.now()) / 60_000)) : undefined;
    how = `on the way${min === undefined ? "" : min < 60 ? `, about ${min} min` : `, about ${Math.round(min / 60)} h`}`;
  }
  await inbox(need.requestedBy.map((userId) => ({
    userId, kind: "notice" as const, priority: need.priority, message: `${what}: ${how}`, key: `need:${need._id}:${status}:${change}`,
  })));
}

/** An evacuation plan: ONE high-risk task for the coordinators. A newer plan cancels an older one still waiting. */
async function planned(a: Extract<TaskAction, { kind: "plan" }>): Promise<void> {
  const { tasks, events } = await cols();
  if (await tasks.findOne({ deskId: a.deskId, type: "evacuate", "history.eventId": a.eventId }, { projection: { _id: 1 } })) return;
  const norm = (id: string) => (id.startsWith(`${a.deskId}:`) ? id.slice(a.deskId.length + 1) : id);
  const mine = new Set(a.exits.map((e) => norm(e.zoneId)));
  for (const t of await tasks.find({ deskId: a.deskId, type: "evacuate", status: "waiting_approval", open: true }).toArray()) {
    const evId = t.history.find((h) => h.eventId)?.eventId;
    const ev = evId ? await events.findOne({ _id: evId }, { projection: { ts: 1, payload: 1 } }) : null;
    const theirs = ((ev?.payload as { zoneExits?: { zoneId: string }[] } | undefined)?.zoneExits ?? []).map((e) => norm(e.zoneId));
    if (ev && !theirs.some((z) => mine.has(z))) continue;
    if (ev && new Date(ev.ts) > a.ts) return; // this plan is the stale one
    const r = await tasks.updateOne({ _id: t._id, status: "waiting_approval" }, {
      $set: { status: "cancelled", open: false },
      $push: { history: entry(`cancelled: a newer evacuation plan replaces it (event ${a.eventId})`) },
    });
    if (r.modifiedCount) await closeApprovals(t._id);
  }
  const lines = a.exits.map((e) => `${e.name} → ${e.exit}`);
  const first = a.exits[0];
  const task: Task = {
    _id: newId(), type: "evacuate", recordType: "zone", recordId: first.zone ?? first.zoneId, tried: [], risk: "high",
    tier: 0, priority: 80, status: "waiting_approval", open: true,
    title: `Approve evacuation plan for ${a.exits.length} ${a.exits.length === 1 ? "zone" : "zones"}`,
    detail: `${lines.join("; ")}. Reason: ${a.reason}`,
    deadline: deadline(), deskId: a.deskId,
    history: [{ ...entry(`evacuation plan from ${a.by}: ${a.reason}`), eventId: a.eventId }, entry("waiting for a coordinator")],
  };
  if (!(await insertTask(task))) return;
  await inboxCoordinators(task, "approval", `Approve: ${task.title}. ${task.detail}`);
  log(`evacuate task ${task._id}: waiting for a coordinator`);
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

async function createFor(type: Task["type"], recordType: "site" | "need", rec: Site | Need, why?: string): Promise<void> {
  const { tasks } = await cols();
  if (await tasks.findOne({ recordId: rec._id, type, open: true }, { projection: { _id: 1 } })) return;
  const bigMove = type === "deliver" && "item" in rec && rec.quantity >= BIG_SUPPLY_MOVE;
  const risk = type === "rescue" || bigMove ? "high" : "low";
  await createTask({
    _id: "", type, recordType, recordId: rec._id, tried: [], risk,
    tier: rec.tier, priority: rec.priority, ...(rec.scoreParts ? { scoreParts: rec.scoreParts } : {}),
    status: "created", open: true, title: titleFor(type, rec), detail: "", deadline: deadline(),
    history: [], deskId: rec.deskId,
  }, { why: why ?? whyFor(type, rec) });
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
    detail: withShort(opts.replaces ? from.detail : detailFor(from.type, rec), pick),
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
    if (task.type === "deliver" && await noteNeedAssigned(task.recordId, task._id, task.assignee!)) await tellAskers(task.recordId, "assigned", task._id);
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

// ---------- group B: roads, shelters, zones, corrections ----------

const minutesAgo = (d: Date) => {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60_000);
  return m < 1 ? "just now" : `${m} min ago`;
};
/** "unknown" is a place nobody could name: it matches every region instead of none. */
const sameRegion = (a: string | undefined, b: string | undefined) => !a || !b || a === "unknown" || b === "unknown" || a === b;

/** A road changed: tell whoever has open work near it, once each. No alternative road is named (§8.3). */
async function roadChanged(ch: Change): Promise<void> {
  const { roads, tasks, sites, needs } = await cols();
  const road = await roads.findOne({ _id: ch.recordId });
  if (!road) return;
  const open = await tasks.find({ deskId: road.deskId, open: true, assignee: { $exists: true } }).toArray();
  const siteById = new Map((await sites.find({ _id: { $in: open.filter((t) => t.recordType === "site").map((t) => t.recordId) } }).toArray()).map((s) => [s._id, s]));
  const needById = new Map((await needs.find({ _id: { $in: open.filter((t) => t.recordType === "need").map((t) => t.recordId) } }).toArray()).map((n) => [n._id, n]));
  const nearRoad = (t: Task): boolean => {
    const rec = t.recordType === "site" ? siteById.get(t.recordId) : t.recordType === "need" ? needById.get(t.recordId) : undefined;
    if (!rec) return false;
    if (road.coords && "coords" in rec && rec.coords) return haversineMeters(road.coords, rec.coords) <= 1000;
    return Boolean(road.region) && rec.region === road.region;
  };
  const who = new Map<string, Task>();
  for (const t of open) if (t.assignee && !who.has(t.assignee) && nearRoad(t)) who.set(t.assignee, t);
  const message = `${road.road} is ${road.state === "open" ? "open again" : "closed"} (${road.confidence}, ${road.source ?? "unknown source"}, ${minutesAgo(road.observedAt)})`;
  await inbox([...who].map(([userId, t]) => ({
    userId, taskId: t._id, kind: "notice" as const, priority: 10, message, key: `road:${road._id}:${ch.eventId}`,
  })));
}

async function shelterChanged(ch: Change): Promise<void> {
  const { shelters } = await cols();
  const shelter = await shelters.findOne({ _id: ch.recordId });
  if (!shelter) return;
  if (ch.flags?.includes("full") && shelter.bedsTotal > 0 && shelter.bedsUsed / shelter.bedsTotal > 0.9) {
    const others = (await shelters.find({ deskId: shelter.deskId, _id: { $ne: shelter._id } }).toArray())
      .filter((s) => sameRegion(s.region, shelter.region) && s.bedsTotal > s.bedsUsed)
      .sort((a, b) => (b.bedsTotal - b.bedsUsed) - (a.bedsTotal - a.bedsUsed));
    const alt = others[0];
    if (alt) {
      const crowd = (await peopleOn(shelter.deskId, ["volunteer"])).filter((u) => sameRegion(u.region, shelter.region));
      await inbox(crowd.map((u) => ({
        userId: u._id, kind: "notice" as const, priority: 20, key: `full:${shelter._id}:${ch.eventId}`,
        message: `${shelter.name} ${shelter.bedsUsed}/${shelter.bedsTotal}: send new arrivals to ${alt.name} (${alt.bedsUsed}/${alt.bedsTotal})`,
      })));
    }
  }
  if (ch.flags?.includes("confirm") && ch.note) {
    const keepers = (await peopleOn(shelter.deskId, ["shelter"])).filter((u) => sameRegion(u.region, shelter.region));
    await inbox(keepers.map((u) => ({
      userId: u._id, kind: "notice" as const, priority: 30, message: ch.note!, key: `confirm:${shelter._id}:${ch.eventId}`,
    })));
  }
}

/** Zone records got a satellite term: copy the new priority onto their open tasks. */
async function syncRecordPriority(type: "site" | "need", id: string): Promise<void> {
  const rec = await recordOf(type, id);
  if (rec) await syncPriority([{ recordId: id, priority: rec.priority, scoreParts: rec.scoreParts ?? [] }]);
}

/** A silent zone: one high-risk task for the coordinators, ever ("send a field team to district Y?"). */
async function silentZone(zoneId: string): Promise<void> {
  const { zones, tasks } = await cols();
  const zone = await zones.findOne({ _id: zoneId });
  if (!zone?.silentZone) return;
  if (await tasks.findOne({ recordType: "zone", recordId: zone._id, type: "assist" }, { projection: { _id: 1 } })) return;
  const calls = `${zone.calls} ${zone.calls === 1 ? "call" : "calls"}`;
  const base: Task = {
    _id: newId(), type: "assist", recordType: "zone", recordId: zone._id, tried: [], risk: "high", tier: 1, priority: 60,
    status: "created", open: true, title: `Send a field team to ${zone.name}?`,
    detail: `Silent zone: heavy damage, ${zone.dark ? "power out" : "lights on"}, ${calls}. Nobody is reporting from here.`,
    deadline: deadline(), history: [entry("silent zone: satellite shows damage but almost no calls")], deskId: zone.deskId,
  };
  const pick = await pickFor(base, []);
  let task: Task;
  if (pick.ok) {
    const team = `Proposed team: ${pick.user.name} (${pick.user._id})${pick.meters !== undefined ? `, ${distanceText(pick.meters)} away` : ""}.`;
    task = { ...base, status: "waiting_approval", detail: `${base.detail} ${team}`, history: [...base.history, entry(`waiting for a coordinator, ${team}`)] };
  } else {
    task = { ...base, status: "escalated", history: [...base.history, entry(`escalated, ${pick.reason}`)] };
  }
  if (!(await insertTask(task))) return;
  if (task.status === "waiting_approval") await inboxCoordinators(task, "approval", `Approve: ${task.title}. ${task.detail}`);
  else await inboxCoordinators(task, "notice", `Nobody fits: ${task.title}. ${cap(pick.ok ? "" : pick.reason)}.`);
  log(`assist task ${task._id} for zone ${zone._id}: ${task.status}`);
}

/** A person retracted a record: its open tasks stop, and whoever held one is told. */
async function cancelled(a: Extract<TaskAction, { kind: "cancel" }>): Promise<void> {
  const { tasks } = await cols();
  for (const t of await tasks.find({ deskId: a.deskId, recordId: a.recordId, open: true }).toArray()) {
    const r = await tasks.updateOne({ _id: t._id, open: true }, {
      $set: { status: "cancelled", open: false }, $push: { history: entry(`cancelled, the ${a.recordType} was retracted: ${a.reason}`, a.by) },
    });
    if (r.modifiedCount) await closeApprovals(t._id);
    if (r.modifiedCount && t.assignee) {
      await inbox([{
        userId: t.assignee, taskId: t._id, kind: "notice", priority: 20, key: `cancel:${t._id}`,
        message: `Stop: ${t.title}. It was withdrawn by ${a.by}: ${a.reason}`,
      }]);
    }
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
  if (task.recordType === "zone") {
    const { zones } = await cols();
    const zone = await zones.findOne({ _id: task.recordId });
    return pickPerson(users, new Map(counts.map((c) => [c._id, c.n])), { region: zone?.region ?? "unknown" }, { roles, exclude: tried }, now);
  }
  const rec = await recordOf(task.recordType as "site" | "need", task.recordId);
  const place: Place = rec && "coords" in rec ? { coords: rec.coords, region: rec.region } : { region: rec?.region ?? "unknown" };
  const open = new Map(counts.map((c) => [c._id, c.n]));
  if (task.type === "deliver" && rec && "item" in rec) {
    // A supplier who has all of it first. Else the one with the most, and the task says so.
    const { item, quantity } = rec;
    const first = pickPerson(users, open, place, { roles, exclude: tried, has: (u) => stockOf(u, item) >= quantity, what: `${quantity} ${item} in stock` }, now);
    if (first.ok) return first;
    const levels = [...new Set(users.filter((u) => roles.includes(u.role)).map((u) => stockOf(u, item)).filter((n) => n > 0 && n < quantity))].sort((a, b) => b - a);
    for (const level of levels) {
      const p = pickPerson(users, open, place, { roles, exclude: tried, has: (u) => stockOf(u, item) >= level, what: `${item} in stock` }, now);
      if (p.ok) return { ...p, short: { has: stockOf(p.user, item), want: quantity } };
    }
    return first;
  }
  return pickPerson(users, open, place, { roles, exclude: tried }, now);
}

async function recordOf(type: "site" | "need", id: string): Promise<Site | Need | null> {
  const { sites, needs } = await cols();
  return type === "site" ? sites.findOne({ _id: id }) : needs.findOne({ _id: id });
}

// ---------- inboxes ----------

async function inbox(items: Omit<InboxItem, "_id" | "status" | "ts">[]): Promise<void> {
  const { inbox } = await cols();
  // An item with a key goes to a person once: the same notice twice (a re-run) is skipped.
  const fresh: typeof items = [];
  for (const i of items) {
    if (i.key && await inbox.findOne({ userId: i.userId, key: i.key }, { projection: { _id: 1 } })) continue;
    fresh.push(i);
  }
  if (!fresh.length) return;
  const ts = new Date();
  await inbox.insertMany(fresh.map((i) => ({ ...i, _id: newId(), status: "unread" as const, ts })));
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
  if ((rec as Need).quantity >= BIG_SUPPLY_MOVE) return `big supply move, ${(rec as Need).quantity} ${(rec as Need).item}, ${(rec as Need).support} asked`;
  return `open need, ${(rec as Need).support} asked`;
}

// The proposal is written into the detail in one fixed shape, so an approval can find it again.
const PROPOSAL = /\s*Proposed team: .*\(([^()]+)\)(, [^.]* away)?\.$/;
const proposedIn = (detail: string) => detail.match(PROPOSAL)?.[1];
const stripProposal = (detail: string) => detail.replace(PROPOSAL, "");
const near = (p: Pick) => (p.ok ? `${p.meters !== undefined ? `, ${distanceText(p.meters)} away` : ""}${p.short ? `, has ${p.short.has} of ${p.short.want}` : ""}` : "");
/** "Supplier has 12 of 30." once at the end of a delivery's detail (before any proposal). */
const SHORT = /\s*Supplier has \d+ of \d+\./;
const withShort = (detail: string, p: Pick) => {
  const base = detail.replace(SHORT, "");
  return p.ok && p.short ? `${PROPOSAL.test(base) ? stripProposal(base) : base} Supplier has ${p.short.has} of ${p.short.want}.`.trim() : base;
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
