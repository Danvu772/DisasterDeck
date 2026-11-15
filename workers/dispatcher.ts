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
import { distanceText, isOnline, pickPerson, stockOf, type Pick, type Place } from "../lib/rules/assign";
import { PLAYBOOK } from "../lib/rules/incidents";
import type { HistoryEntry, Incident, InboxItem, LatLng, Need, Role, ScorePart, Site, Task, User } from "../lib/types";
import { confirmedSince, noteIncidentStep, noteNeedAssigned, restNeedId, setIncidentStatus, type Change, type TaskAction } from "./memory-keeper";

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
    else if (ch.recordType === "incident" && ch.flags?.includes("resolved")) await incidentResolved(ch.recordId);
    else if (ch.recordType === "road") { if (ch.flags?.includes("notify")) await roadChanged(ch); }
    else if (ch.recordType === "shelter") await shelterChanged(ch);
    else if (ch.recordType === "zone" && ch.flags?.includes("silent")) await silentZone(ch.recordId);
    if ((ch.recordType === "site" || ch.recordType === "need") && ch.flags?.includes("rescored")) {
      await syncRecordPriority(ch.recordType, ch.recordId);
    }
  }
}

// ---------- every tick: the rules over what is on the desk now ----------

async function openTasksByDesk(desk?: string): Promise<Map<string, number>> {
  const { tasks } = await cols();
  const rows = await tasks.aggregate<{ _id: string; n: number }>([
    { $match: { open: true, ...(desk ? { deskId: desk } : {}) } },
    { $group: { _id: "$deskId", n: { $sum: 1 } } },
  ]).toArray();
  return new Map(rows.map((r) => [r._id, r.n]));
}

/**
 * react() only sees the changes an event made, so a record that was already on the desk never
 * got its task. This runs the same rules over every open site and need, once per tick. createFor()
 * finds the open task first, so a tick with nothing new writes nothing. Returns the desks whose
 * open task count went up, so the caller can bump their version.
 */
export async function reconcile(desk?: string): Promise<{ created: number; desks: string[] }> {
  const { sites, needs } = await cols();
  const q = desk ? { deskId: desk } : {};
  const [s, n] = await Promise.all([
    sites.find({ ...q, status: "open" }, { projection: { _id: 1 } }).toArray(),
    needs.find({ ...q, status: "open" }, { projection: { _id: 1 } }).toArray(),
  ]);
  if (!s.length && !n.length) return { created: 0, desks: [] };
  const before = await openTasksByDesk(desk);
  await react([
    ...s.map((r): Change => ({ recordType: "site", recordId: r._id, op: "updated", eventId: "reconcile", fields: ["status"] })),
    ...n.map((r): Change => ({ recordType: "need", recordId: r._id, op: "updated", eventId: "reconcile", fields: ["status"] })),
  ]);
  const after = await openTasksByDesk(desk);
  const desks = [...after].filter(([d, c]) => c > (before.get(d) ?? 0)).map(([d]) => d);
  const created = [...after.values()].reduce((a, c) => a + c, 0) - [...before.values()].reduce((a, c) => a + c, 0);
  return { created: Math.max(0, created), desks };
}

/**
 * An escalated task gets another try every tick, with the same rules as a new task. The first
 * person who is free and fits takes it, so a volunteer who comes online gets the work nobody could
 * take. A task that said no MAX_TRIES times stays escalated for a coordinator. A task on a closed
 * or retracted site is left alone. Returns the desks whose tasks moved.
 */
export async function redelegate(desk?: string, now: Date = new Date()): Promise<{ moved: number; desks: string[] }> {
  const { tasks } = await cols();
  const waiting = await tasks.find({ ...(desk ? { deskId: desk } : {}), status: "escalated", open: true }).toArray();
  const desks = new Set<string>();
  let moved = 0;
  for (const t of waiting) {
    if (t.tried.length >= MAX_TRIES || (t.recordType !== "site" && t.recordType !== "need")) continue;
    const rec = await recordOf(t.recordType, t.recordId);
    if (!rec || rec.status === "closed" || rec.status === "retracted") continue;
    const pick = await pickFor(t, t.tried, now);
    if (!pick.ok) continue;
    const team = `Proposed team: ${pick.user.name} (${pick.user._id})${pick.meters !== undefined ? `, ${distanceText(pick.meters)} away` : ""}.`;
    const high = t.risk === "high";
    const set = high
      ? { status: "waiting_approval" as const, detail: `${stripProposal(t.detail)} ${team}`.trim() }
      : { status: "assigned" as const, assignee: pick.user._id };
    const r = await tasks.updateOne(
      { _id: t._id, status: "escalated", open: true },
      { $set: { ...set, deadline: deadline(now) }, $push: { history: entry(high ? `waiting for a coordinator, ${team}` : `assigned to ${pick.user._id}${near(pick)}`) } },
    );
    if (!r.modifiedCount) continue;
    moved++;
    desks.add(t.deskId);
    if (high) await inboxCoordinators({ ...t, ...set }, "approval", `Approve: ${t.title}. ${set.detail}`);
    else await inboxTask({ ...t, assignee: pick.user._id });
  }
  return { moved, desks: [...desks] };
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
 * The sweeper's "no answer": the deadline passed on an assigned task. Silence is not a no, so a
 * task never dead-ends on it and the person does not go into `tried`:
 *   - the person's screen is open (seen in the last 3 minutes): the task stays with them;
 *   - else, someone else who fits has their screen open: the task moves to them;
 *   - else it stays where it is, and the next person to open their screen sees it there.
 * Staying only renews the deadline (no history line, no new inbox item). A conditional update,
 * so a second tick (or a second Brain) handles each task once.
 */
export async function timedOut(task: Task, now: Date = new Date()): Promise<void> {
  if (!task.assignee) return;
  const { tasks, users } = await cols();
  const guard = { _id: task._id, assignee: task.assignee, status: "assigned" as const, deadline: { $lt: now } };
  const me = await users.findOne({ _id: task.assignee }, { projection: { lastSeen: 1 } });
  const pick = me && isOnline(me, now) ? null : await pickFor(task, [...task.tried, task.assignee], now);
  if (!pick?.ok || !isOnline(pick.user, now)) {
    await tasks.updateOne(guard, { $set: { deadline: deadline(now) } });
    return;
  }
  const r = await tasks.updateOne(guard, {
    $set: { assignee: pick.user._id, deadline: deadline(now) },
    $unset: { eta: "", progress: "", checkinAt: "" },
    $push: { history: { $each: [
      entry(`no answer from ${task.assignee} in ${ANSWER_MINUTES} min, not on the app`),
      entry(`reassigned to ${pick.user._id}${near(pick)}`),
    ] } },
  });
  if (r.modifiedCount) await inboxTask({ ...task, assignee: pick.user._id });
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
      const r = await tasks.updateOne({ _id: task._id, status: { $in: ["waiting_approval", "escalated"] }, ...(eventId ? { "history.eventId": { $ne: eventId } } : {}) },
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
  const why = task.status === "escalated" ? `assigned by ${by}` : assignee ? `approved by ${by}, sent ${assignee} instead` : `approved by ${by}`;
  const r = await tasks.updateOne({ _id: task._id, status: { $in: ["waiting_approval", "escalated"] } }, pick.ok
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

// ---------- the help desk: the playbook of §6, read from lib/rules/incidents.ts ----------

/** How the steps of one incident went, between the block (an action) and the card (a change) of the same event. */
const outcomes = new Map<string, boolean>();
const noteOutcome = (incidentId: string, found: boolean) => outcomes.set(incidentId, (outcomes.get(incidentId) ?? true) && found);

const hasVehicle = (u: User) => Boolean(u.profile?.vehicle && u.profile.vehicle !== "none");
const canHelpWithCar = (u: User) => Boolean(u.profile?.skills?.includes("mechanic")) || hasVehicle(u);
const SPEED_M_PER_MIN = 500; // 30 km/h
const minutesFor = (meters: number) => Math.max(5, Math.round(meters / SPEED_M_PER_MIN));
const coordsText = (c: LatLng) => `${c[0].toFixed(4)}, ${c[1].toFixed(4)}`;

/** An incident stopped the task: block it, and protect the mission, help the person, tell everyone (§6). */
async function blocked(task: Task, by: string, incidentId: string, reason: string): Promise<void> {
  const { tasks, incidents } = await cols();
  const tried = task.assignee && !task.tried.includes(task.assignee) ? [...task.tried, task.assignee] : task.tried;
  const r = await tasks.updateOne({ _id: task._id, open: true }, {
    $set: { status: "blocked", open: false, blockedBy: incidentId, tried },
    $push: { history: entry(`blocked by incident ${incidentId}, ${reason}`, by) },
  });
  if (!r.modifiedCount) return;
  const inc = await incidents.findOne({ _id: incidentId });
  const plan = PLAYBOOK[inc?.kind ?? "handover"];
  await noteIncidentStep(incidentId, `task ${task._id} blocked: ${task.title}`, task._id);
  if (plan.replace === "none") return;

  // 1. Protect the mission: the replacement.
  const from: Task = { ...task, tried };
  let made: Task | null = null;
  let how = "";
  let etaMeters: number | undefined;
  if (plan.replace === "relay_or_fresh" && inc && task.type === "deliver" && task.recordType === "need") {
    const d = await replaceDelivery(from, inc);
    made = d.made; how = d.how; etaMeters = d.meters;
  } else {
    made = await createTask(from, { replaces: task._id, why: `replaces task ${task._id}, blocked by incident ${incidentId}` });
    how = "same task to the next person";
  }
  const okMade = made?.status === "assigned" || made?.status === "waiting_approval";
  await noteIncidentStep(incidentId, !made ? `task ${task._id} blocked, a replacement could not be made`
    : made.status === "assigned" ? `replacement ${made._id} made (${how}) and sent to ${made.assignee}`
      : made.status === "waiting_approval" ? `replacement ${made._id} made (${how}), waits for a coordinator`
        : `replacement ${made._id} made (${how}), nobody fits: escalated`, made?._id);
  noteOutcome(incidentId, okMade);

  if (!inc) return;
  // 2. Help the person.
  if (plan.assist) noteOutcome(incidentId, (await assistFor(inc, made?.assignee ? [made.assignee] : []))?.status !== "escalated");
  // 3. Tell everyone affected.
  if (plan.tellWaiting) await tellWaiting(inc, task, made, etaMeters);
  await tellReporter(inc, made, how);
}

/** A deliver task failed on the road: a relay from where the load stopped, or a fresh delivery, the closer to the site. */
async function replaceDelivery(from: Task, inc: Incident): Promise<{ made: Task | null; how: string; meters?: number }> {
  const { needs, sites, users } = await cols();
  const need = await needs.findOne({ _id: from.recordId });
  const replaces = from._id;
  const reason = `replaces task, blocked by incident ${inc._id}`;
  if (!need) return { made: await createTask(from, { replaces, why: reason }), how: "same task to the next person" };
  const siteCoords = (await sites.find({ _id: { $in: need.siteIds }, coords: { $exists: true } }).toArray())[0]?.coords;
  const reporter = await users.findOne({ _id: inc.reportedBy });
  const stopped = inc.coords ?? reporter?.coords;
  const siteNames = (await sites.find({ _id: { $in: need.siteIds } }).toArray()).map((s) => (s.caseNo ? `site ${s.caseNo}` : s.address));
  const where = siteNames.length ? siteNames.join(" and ").replace(/^site (\d+) and site (\d+)$/, "sites $1 and $2") : need.region;

  const fresh = await pickFor(from, from.tried, new Date(), siteCoords ? { coords: siteCoords, region: need.region } : undefined);
  const freshM = fresh.ok && fresh.user.coords && siteCoords ? haversineMeters(fresh.user.coords, siteCoords) : undefined;
  const relay = stopped
    ? await pickWith(from.deskId, ["volunteer", "field"], { coords: stopped, region: need.region }, [...from.tried, inc.reportedBy], hasVehicle, "a vehicle")
    : { ok: false as const, reason: "the place where the load stopped is not known" };
  const leg2 = stopped && siteCoords ? haversineMeters(stopped, siteCoords) : undefined;
  const relayM = relay.ok && relay.meters !== undefined && leg2 !== undefined ? relay.meters + leg2 : undefined;

  let useRelay: boolean;
  if (!relay.ok) useRelay = false;
  else if (!fresh.ok || fresh.short) useRelay = true;
  else useRelay = relayM !== undefined && freshM !== undefined && relayM < freshM;

  if (useRelay && relay.ok && stopped) {
    const load = Number(from.detail.match(/Supplier has (\d+) of/)?.[1] ?? need.quantity);
    const detail = `Relay: pick up ${load} ${need.item} from the truck at ${coordsText(stopped)} (${inc.textEn}), take them to ${where}. `
      + `${distanceText(relay.meters ?? 0)} to the truck${leg2 !== undefined ? `, then ${distanceText(leg2)} to the delivery` : ""}.`;
    const made = await createTask({ ...from, title: `Relay ${load} ${need.item} to ${need.region}` }, { replaces, why: `relay: ${reason}`, pick: relay, detail });
    return { made, how: `relay: pick up at the truck, then to ${where}`, meters: relayM };
  }
  const detail = `${detailFor("deliver", need)} Fresh delivery: the first supplier's truck broke down (${inc.textEn}). Bring ${need.quantity} ${need.item} to ${where}`
    + `${freshM !== undefined ? `, ${distanceText(freshM)} away` : ""}.`;
  const made = await createTask(from, { replaces, why: `fresh delivery: ${reason}`, pick: fresh, detail });
  return { made, how: `fresh delivery from another supplier${freshM !== undefined ? `, ${distanceText(freshM)} from the site` : ""}`, meters: freshM };
}

/** The nearest free person with a mechanic skill or a vehicle goes to help the person. Once per incident. */
async function assistFor(inc: Incident, avoid: string[]): Promise<Task | null> {
  const reporter = (await (await cols()).users.findOne({ _id: inc.reportedBy }));
  const name = reporter?.name ?? inc.reportedBy;
  return incidentTask(inc, {
    title: `Help ${name} with the broken vehicle`,
    detail: `${name} is stuck${inc.coords ? ` at ${coordsText(inc.coords)}` : ""}: ${inc.textEn}. Bring what is needed to get moving again (for example a jack and a spare wheel).`,
    risk: "low", exclude: [inc.reportedBy], avoid, has: canHelpWithCar, what: "a mechanic skill or a vehicle", why: `help for ${inc.reportedBy}, incident ${inc._id}`,
    step: (t) => `assist task ${t._id} ${t.status === "assigned" ? `sent to ${t.assignee}` : t.status === "waiting_approval" ? "waits for a coordinator" : "escalated: nobody has a mechanic skill or a vehicle"}`,
  });
}

interface IncidentTaskSpec {
  title: string; detail: string; risk: "low" | "high"; exclude: string[]; avoid?: string[];
  has?: (u: User) => boolean; prefer?: (u: User) => boolean; what: string; why: string;
  step: (t: Task) => string;
}

/** An assist task for an incident (recordType "incident"): one per incident, ever. Picks, inserts, tells whoever has to act. */
async function incidentTask(inc: Incident, spec: IncidentTaskSpec): Promise<Task | null> {
  const { tasks, users } = await cols();
  const old = await tasks.findOne({ recordType: "incident", recordId: inc._id, type: "assist" });
  if (old) return old;
  const reporter = await users.findOne({ _id: inc.reportedBy });
  const coords = inc.coords ?? reporter?.coords;
  const place: Place = { ...(coords ? { coords } : {}), region: reporter?.region ?? "unknown" };
  const roles: Role[] = ["volunteer", "field"];
  // The best fit first, never someone who is already doing the other job if anyone else will do.
  let pick: Pick = { ok: false, reason: "nobody asked" };
  for (const [ex, has] of [
    [[...spec.exclude, ...(spec.avoid ?? [])], spec.prefer && spec.has ? (u: User) => spec.prefer!(u) && spec.has!(u) : spec.prefer ?? spec.has],
    [[...spec.exclude, ...(spec.avoid ?? [])], spec.has],
    [spec.exclude, spec.has],
  ] as [string[], ((u: User) => boolean) | undefined][]) {
    pick = await pickWith(inc.deskId, roles, place, ex, has, spec.what);
    if (pick.ok) break;
  }
  const critical = inc.severity === "critical";
  const base: Task = {
    _id: newId(), type: "assist", recordType: "incident", recordId: inc._id, tried: [], risk: spec.risk,
    tier: critical ? 0 : 1, priority: critical ? 90 : inc.severity === "high" ? 60 : 20, status: "created", open: true,
    title: spec.title, detail: spec.detail, deadline: deadline(), history: [entry(spec.why)], deskId: inc.deskId,
  };
  let task: Task;
  if (!pick.ok) task = { ...base, status: "escalated", history: [...base.history, entry(`escalated, ${pick.reason}`)] };
  else if (spec.risk === "high") {
    const team = `Proposed team: ${pick.user.name} (${pick.user._id})${pick.meters !== undefined ? `, ${distanceText(pick.meters)} away` : ""}.`;
    task = { ...base, status: "waiting_approval", detail: `${base.detail} ${team}`, history: [...base.history, entry(`waiting for a coordinator, ${team}`)] };
  } else task = { ...base, status: "assigned", assignee: pick.user._id, history: [...base.history, entry(`assigned to ${pick.user._id}${near(pick)}`)] };
  if (!(await insertTask(task))) return (await tasks.findOne({ recordType: "incident", recordId: inc._id, type: "assist" })) ?? null;
  if (task.status === "assigned") await inboxTask(task);
  else if (task.status === "waiting_approval") await inboxCoordinators(task, "approval", `Approve: ${task.title}. ${task.detail}`);
  else await inboxCoordinators(task, "notice", `Nobody fits: ${task.title}. ${cap(pick.ok ? "" : pick.reason)}.`);
  await noteIncidentStep(inc._id, spec.step(task), task._id);
  log(`assist task ${task._id} for incident ${inc._id}: ${task.status}${task.assignee ? ` to ${task.assignee}` : ""}`);
  return task;
}

/** Everyone whose open task touches the same need, and the people who asked, hear the new ETA. */
async function tellWaiting(inc: Incident, blockedTask: Task, made: Task | null, meters?: number): Promise<void> {
  const { needs, tasks, sites } = await cols();
  const need = await needs.findOne({ _id: blockedTask.recordId });
  if (!need) return;
  const site = need.siteIds[0] ? await sites.findOne({ _id: need.siteIds[0] }, { projection: { caseNo: 1 } }) : null;
  const what = `${cap(need.item)} for ${site?.caseNo ? `site ${site.caseNo}` : need.region}`;
  const ok = made?.status === "assigned" || made?.status === "waiting_approval";
  const message = ok
    ? `${what}: problem on the way (${inc.textEn}), ${meters !== undefined ? `new ETA about ${minutesFor(meters)} min` : "a replacement is on the way"}`
    : `${what}: problem on the way (${inc.textEn}), delayed, finding a new supplier`;
  const open = await tasks.find({
    deskId: inc.deskId, open: true, assignee: { $exists: true },
    $or: [{ recordId: need._id }, { recordId: { $in: need.siteIds } }],
  }).toArray();
  const who = new Map<string, string | undefined>();
  for (const t of open) if (t.assignee && t.assignee !== inc.reportedBy && t.assignee !== made?.assignee && !who.has(t.assignee)) who.set(t.assignee, t._id);
  // The askers already heard "delayed, a new supplier is being found" from the need going back to open.
  if (ok) for (const u of need.requestedBy) if (u !== inc.reportedBy && !who.has(u)) who.set(u, undefined);
  await inbox([...who].map(([userId, taskId]) => ({
    userId, ...(taskId ? { taskId } : {}), kind: "notice" as const, priority: need.priority, message, key: `incident:${inc._id}:eta:${userId}`,
  })));
  if (who.size) await noteIncidentStep(inc._id, `${who.size} ${who.size === 1 ? "person" : "people"} told ${ok && meters !== undefined ? `the new ETA, about ${minutesFor(meters)} min` : ok ? "a replacement is on the way" : "delayed, finding a new supplier"}`);
}

/** The person who reported it hears what the desk did. */
async function tellReporter(inc: Incident, made: Task | null, how: string): Promise<void> {
  if (inc.reportedBy === "sweeper") return;
  const { tasks } = await cols();
  const assist = await tasks.findOne({ recordType: "incident", recordId: inc._id, type: "assist" });
  const parts = [
    made?.assignee ? `${made.assignee} takes over (${how})` : made ? "the load waits for a coordinator" : "",
    assist?.assignee ? `${assist.assignee} is coming to help you` : "",
  ].filter(Boolean);
  if (!parts.length) return;
  await inbox([{ userId: inc.reportedBy, kind: "notice", priority: 50, message: `The desk is on it: ${parts.join("; ")}.`, key: `incident:${inc._id}:reporter` }]);
}

/** The problem is over: the helper's task stops, the person is free (the keeper did that). */
async function incidentResolved(incidentId: string): Promise<void> {
  const { tasks } = await cols();
  for (const t of await tasks.find({ recordType: "incident", recordId: incidentId, open: true }).toArray()) {
    const r = await tasks.updateOne({ _id: t._id, open: true }, {
      $set: { status: "cancelled", open: false }, $push: { history: entry("cancelled, the problem is over") },
    });
    if (!r.modifiedCount) continue;
    await closeApprovals(t._id);
    await noteIncidentStep(incidentId, `task ${t._id} closed, the problem is over`, t._id);
    if (t.assignee) {
      await inbox([{ userId: t.assignee, taskId: t._id, kind: "notice", priority: 20, key: `incident:${incidentId}:over:${t._id}`, message: `Stop: ${t.title}. The problem is over.` }]);
    }
  }
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

/**
 * A new incident: the steps that do not need a blocked task (warnings, the rest of a short supply,
 * verifying a site again, the medical or rescue proposal), the final status, and the card for the
 * coordinators, which says what happened and what the desk already did.
 */
async function incidentOpened(incidentId: string): Promise<void> {
  const { incidents, tasks, needs, sites } = await cols();
  let inc = await incidents.findOne({ _id: incidentId });
  if (!inc) return;
  const plan = PLAYBOOK[inc.kind];
  const task = inc.taskId ? await tasks.findOne({ _id: inc.taskId }) : null;
  const need = task?.recordType === "need" ? await needs.findOne({ _id: task.recordId }) : null;
  const siteId = task?.recordType === "site" ? task.recordId : need?.siteIds[0];
  const site = siteId ? await sites.findOne({ _id: siteId }) : null;
  const liveStatus = inc.status === "open";

  if (liveStatus) {
    if (plan.assist && !inc.canContinue && !(task?.status === "blocked" && task.blockedBy === inc._id)) {
      noteOutcome(incidentId, (await assistFor(inc, []))?.status !== "escalated");
    }

    if (plan.hazard && site) {
      const here = await tasks.find({
        deskId: inc.deskId, open: true, assignee: { $exists: true, $ne: inc.reportedBy },
        $or: [{ recordId: site._id }, { recordId: { $in: (await needs.find({ siteIds: site._id }, { projection: { _id: 1 } }).toArray()).map((n) => n._id) } }],
      }).toArray();
      const who = new Map<string, string>();
      for (const t of here) if (t.assignee && !who.has(t.assignee)) who.set(t.assignee, t._id);
      const label = site.caseNo ? `site ${site.caseNo}` : site.address;
      await inbox([...who].map(([userId, taskId]) => ({
        userId, taskId, kind: "notice" as const, priority: 100, key: `incident:${inc!._id}:warn`,
        message: `Warning at ${label}: ${inc!.kind === "injury" ? "someone is hurt" : "it is not safe"} (${inc!.textEn}). Stop and wait for the desk.`,
      })));
      await noteIncidentStep(incidentId, who.size ? `${who.size} ${who.size === 1 ? "person" : "people"} with a task at ${label} warned` : `nobody else has a task at ${label}`);
    }

    if (plan.proposeHelp) {
      const label = site ? (site.caseNo ? `site ${site.caseNo}` : site.address) : "the place";
      const injury = inc.kind === "injury";
      const t = await incidentTask(inc, {
        title: injury ? `Medical help for ${label}` : `Check the hazard at ${label}`,
        detail: `${injury ? "Someone is hurt" : "It is not safe"}${inc.coords ? ` at ${coordsText(inc.coords)}` : ""}: ${inc.textEn}. High risk: a coordinator approves who goes.`,
        risk: "high", exclude: [inc.reportedBy], prefer: injury ? (u) => Boolean(u.profile?.skills?.includes("first_aid")) : undefined,
        what: "volunteers or field teams", why: `${inc.kind} reported by ${inc.reportedBy}, incident ${inc._id}`,
        step: (x) => `${injury ? "medical" : "rescue"} task ${x._id} ${x.status === "waiting_approval" ? "proposed, waits for a coordinator" : "escalated: nobody fits"}`,
      });
      noteOutcome(incidentId, t?.status === "waiting_approval");
    }

    if (plan.splitNeed && need) {
      const rest = await needs.findOne({ _id: restNeedId(incidentId) });
      if (rest) {
        const open = await tasks.findOne({ recordId: rest._id, type: "deliver", open: true });
        const made = open ?? (rest.status === "open" ? await createFor("deliver", "need", rest, `the rest of ${need.item} after a short supply, incident ${incidentId}`, [inc.reportedBy]) : null);
        if (made) {
          await noteIncidentStep(incidentId, made.status === "assigned" ? `deliver task ${made._id} for the other ${rest.quantity} sent to ${made.assignee}`
            : made.status === "waiting_approval" ? `deliver task ${made._id} for the other ${rest.quantity} waits for a coordinator`
              : `deliver task ${made._id} for the other ${rest.quantity}: nobody has stock, escalated`, made._id);
          noteOutcome(incidentId, made.status !== "escalated");
        }
        if (task) {
          await tasks.updateOne({ _id: task._id, open: true, title: { $ne: titleFor("deliver", need) } },
            { $set: { title: titleFor("deliver", need) }, $push: { history: entry(`only ${need.quantity} of ${need.quantity + rest.quantity} will come: incident ${incidentId}`) } });
        }
      }
    }

    if (plan.verifySite && site) {
      const second = inc.actions.some((a) => /second time/.test(a.what));
      if (second) noteOutcome(incidentId, false);
      else {
        const made = await createFor("call", "site", site, `the address could not be found (incident ${incidentId}), a volunteer verifies it by phone`, [inc.reportedBy]);
        const call = made ?? await tasks.findOne({ recordId: site._id, type: "call", open: true });
        if (call) {
          await noteIncidentStep(incidentId, call.assignee ? `call task ${call._id} sent to ${call.assignee}` : `call task ${call._id} ${call.status}`, call._id);
          noteOutcome(incidentId, call.status === "assigned" || call.status === "waiting_approval");
        }
      }
    }

    if (inc.kind === "other") await noteIncidentStep(incidentId, "nothing is automated for this kind of problem: a coordinator decides");

    // The status: helping when every step found someone, escalated when one did not or the row says so.
    const found = outcomes.get(incidentId) ?? true;
    outcomes.delete(incidentId);
    const bySecond = inc.actions.some((a) => /second time/.test(a.what));
    const escalate = plan.escalate === "always" || !found || (plan.escalate === "second_time" && bySecond);
    if (escalate) await noteIncidentStep(incidentId, "a coordinator decides");
    await setIncidentStatus(incidentId, escalate ? "escalated" : "helping");
    inc = (await incidents.findOne({ _id: incidentId })) ?? inc;
  }

  const didList = inc.actions.slice(1).map((a) => a.what);
  const coordinators = await peopleOn(inc.deskId, ["coordinator"]);
  await inbox(coordinators.map((u) => ({
    userId: u._id, kind: "incident" as const, incidentId: inc!._id, ...(inc!.taskId ? { taskId: inc!.taskId } : {}),
    priority: inc!.severity === "critical" ? 100 : inc!.severity === "high" ? 50 : 10, key: `incident-card:${inc!._id}`,
    message: `Problem${inc!.caseNo ? ` ${inc!.caseNo}` : ""}, ${inc!.severity}: ${inc!.kind.replace(/_/g, " ")}. ${inc!.textEn}. `
      + (didList.length ? `The desk did: ${didList.join("; ")}.` : "The desk has done nothing yet."),
  })));
}

async function createFor(type: Task["type"], recordType: "site" | "need", rec: Site | Need, why?: string, tried: string[] = []): Promise<Task | null> {
  const { tasks } = await cols();
  if (await tasks.findOne({ recordId: rec._id, type, open: true }, { projection: { _id: 1 } })) return null;
  const bigMove = type === "deliver" && "item" in rec && rec.quantity >= BIG_SUPPLY_MOVE;
  const risk = type === "rescue" || bigMove ? "high" : "low";
  return createTask({
    _id: "", type, recordType, recordId: rec._id, tried, risk,
    tier: rec.tier, priority: rec.priority, ...(rec.scoreParts ? { scoreParts: rec.scoreParts } : {}),
    status: "created", open: true, title: titleFor(type, rec), detail: "", deadline: deadline(),
    history: [], deskId: rec.deskId,
  }, { why: why ?? whyFor(type, rec) });
}

/**
 * Make one task from a template (a fresh one, or the blocked task it replaces): pick a person,
 * set the status from the risk, insert, and tell whoever has to act. Null when one is open already.
 */
async function createTask(from: Task, opts: { why: string; replaces?: string; pick?: Pick; detail?: string }): Promise<Task | null> {
  const rec = await recordOf(from.recordType as "site" | "need", from.recordId);
  if (!rec) return null;
  const pick = opts.pick ?? await pickFor(from, from.tried);
  const base: Task = {
    ...from,
    _id: newId(),
    detail: withShort(opts.detail ?? (opts.replaces ? from.detail : detailFor(from.type, rec)), pick),
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
  const said = road.state === "open" ? "open again" : road.state === "closed" ? "closed" : "reported closed, not confirmed";
  const message = `${road.road} is ${said} (${road.confidence}, ${road.source ?? "unknown source"}, ${minutesAgo(road.observedAt)})`;
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

/** The free people of these roles with their open task counts, ranked by pickPerson for one place. */
async function pickWith(desk: string, roles: Role[], place: Place, exclude: string[], has?: (u: User) => boolean, what?: string, now: Date = new Date()): Promise<Pick> {
  const { tasks } = await cols();
  const users = await peopleOn(desk, roles);
  const counts = await tasks.aggregate<{ _id: string; n: number }>([
    { $match: { deskId: desk, open: true, assignee: { $in: users.map((u) => u._id) } } },
    { $group: { _id: "$assignee", n: { $sum: 1 } } },
  ]).toArray();
  return pickPerson(users, new Map(counts.map((c) => [c._id, c.n])), place, { roles, exclude, ...(has ? { has } : {}), ...(what ? { what } : {}) }, now);
}

async function pickFor(task: Task, tried: string[], now: Date = new Date(), placeOverride?: Place): Promise<Pick> {
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
  const place: Place = placeOverride ?? (rec && "coords" in rec ? { coords: rec.coords, region: rec.region } : { region: rec?.region ?? "unknown" });
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
  const warn = await roadWarning(task);
  await inbox([{ userId: task.assignee, taskId: task._id, kind: "task", priority: task.priority, message: `${task.title}. ${task.detail}${warn}` }]);
}

/** A road that is not open this close to a task's place is worth a line on the task (v2.5). */
export const ROAD_WARNING_METERS = 1500;
const TRAVEL: Task["type"][] = ["rescue", "deliver", "evacuate", "assist"];

/**
 * " Road: Kernek road closed, 560 m from the place (unconfirmed, x, 20 min ago). Check your route."
 * Empty when the task needs no travel, its place is unknown, or no such road is near. Up to two
 * roads, nearest first. A straight line from the road's one point: a warning, not a route.
 */
export async function roadWarning(task: Task): Promise<string> {
  if (!TRAVEL.includes(task.type)) return "";
  const { roads, sites, needs } = await cols();
  let at: LatLng | undefined;
  if (task.recordType === "site") at = (await sites.findOne({ _id: task.recordId }, { projection: { coords: 1 } }))?.coords;
  else if (task.recordType === "need") {
    const need = await needs.findOne({ _id: task.recordId }, { projection: { siteIds: 1 } });
    const site = need?.siteIds.length
      ? await sites.findOne({ _id: { $in: need.siteIds }, coords: { $exists: true } }, { projection: { coords: 1 } }) : null;
    at = site?.coords;
  }
  if (!at) return "";
  const near = (await roads.find({ deskId: task.deskId, state: { $ne: "open" }, coords: { $exists: true } }).toArray())
    .map((r) => ({ r, m: haversineMeters(at!, r.coords!) }))
    .filter((x) => x.m <= ROAD_WARNING_METERS)
    .sort((a, b) => a.m - b.m)
    .slice(0, 2);
  if (!near.length) return "";
  const lines = near.map(({ r, m }) =>
    `${r.road} ${r.state === "closed" ? "closed" : "reported closed"}, ${distanceText(m)} from the place (${r.confidence}, ${r.source ?? "unknown source"}, ${minutesAgo(r.observedAt)})`);
  return ` Road: ${lines.join("; ")}. Check your route.`;
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
