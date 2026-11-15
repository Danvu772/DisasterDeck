// The personal agent's tools. Every write tool posts exactly one event and nothing else:
// the memory keeper (Role 1) is the only writer of records. ask_desk only reads.
// Schemas are strict: every key required, null for "not said".
// Inputs are checked again here (task ids, roles), because the model's output is untrusted.

import type Anthropic from "@anthropic-ai/sdk";
import type {
  AnswerPayload, ApprovalPayload, CapacityPayload, ClaimPayload, ClosurePayload, CorrectionPayload,
  IncidentKind, IncidentPayload, NeedPayload, RecordType, ReportPayload, Role,
} from "@/lib/types";
import { desk, type NewEvent, type UserContext } from "../desk";
import { askDesk, topicsFor, type Topic } from "../desk/view";
import { maskPhones } from "../shared/privacy";
import { writeHandoff } from "./handoff";

type Tool = Anthropic.Beta.BetaTool;
const str = { type: "string" } as const;
const nstr = { type: ["string", "null"] } as const;
const nint = { type: ["integer", "null"] } as const;

function obj(properties: Record<string, unknown>): Tool["input_schema"] {
  return { type: "object", additionalProperties: false, required: Object.keys(properties), properties } as Tool["input_schema"];
}

const INCIDENT_KINDS: IncidentKind[] = ["vehicle_breakdown", "road_blocked", "cannot_find", "short_supply",
  "unsafe", "injury", "handover", "unreachable", "other"];
const RECORD_TYPES: RecordType[] = ["site", "need", "road", "shelter", "zone", "incident"];

const DEFS: Record<string, Tool> = {
  ask_desk: {
    name: "ask_desk",
    description: "Read the shared desk. Use it for any question about the crisis: sites, needs, shelters with space, closed roads, incidents, tasks, or a summary of what happened and what is stuck. Topic \"mine\" lists this person's own open tasks, needs and problems, for when <desk_context> says more are not shown. Read only: it files nothing. Every line it returns has its source and age; quote them. Answers come 12 lines at a time; ask again with the next page for more.",
    input_schema: obj({
      topic: { type: "string", enum: ["summary", "mine", "sites", "needs", "shelters", "roads", "incidents", "tasks"] },
      region: { ...nstr, description: "District or neighbourhood to filter by, or null for all." },
      // Plain integer, not nullable: the API allows at most 16 nullable parameters across all of a
      // request's strict tools, and the volunteer and field tool sets were at 17 (HTTP 400).
      page: { type: "integer", description: "0 for the first 12 lines, 1 for the next 12, and so on." },
    }),
  },
  answer_task: {
    name: "answer_task",
    description: "Answer one of the person's own tasks: accepted (they will do it), declined (they cannot), or done (finished). Use the task id from the context. For a volunteer's call, put what they heard in note.",
    input_schema: obj({
      task_id: str,
      result: { type: "string", enum: ["accepted", "declined", "done"] },
      note: { ...str, description: "What they said about it, or an empty string. (Not nullable: see page above.)" },
      eta_minutes: { ...nint, description: "Minutes until done, if they said it." },
    }),
  },
  file_need: {
    name: "file_need",
    description: "File one need the person has or reports: supplies, equipment, food, medicine, a doctor, fuel. One call per item. Use the total quantity they need now.",
    input_schema: obj({
      item: { ...str, description: "Short English name, plural if counted: blankets, tent, insulin, doctor, jackhammer, diapers, food for the team." },
      quantity: { type: "integer", description: "How many. 1 if they did not say a number." },
      life_threatening: { type: "boolean" },
      site_id: { ...nstr, description: "Only a site id that appears in the context." },
      region: nstr,
    }),
  },
  file_report: {
    name: "file_report",
    description: "File what the person saw about people: someone trapped, missing or rescued, or news about a collapse site.",
    input_schema: obj({
      kind: { type: "string", enum: ["trapped", "missing", "rescued", "site_update"] },
      text: { ...str, description: "The person's own words, in their language, unchanged." },
      text_en: { ...str, description: "English translation." },
      address: nstr,
      region: nstr,
      people_count: nint,
      site_id: { ...nstr, description: "Only a site id that appears in the context." },
    }),
  },
  file_closure: {
    name: "file_closure",
    description: "File the state of a road: closed, open again, or unconfirmed (someone heard it is blocked).",
    input_schema: obj({
      road: str,
      state: { type: "string", enum: ["closed", "open", "unconfirmed"] },
      reason: { ...str, description: "Why, in English: collapsed building, crash, debris, traffic." },
    }),
  },
  file_capacity: {
    name: "file_capacity",
    description: "File a shelter's beds: used and total. From the person's words or a readable photo of the whiteboard.",
    input_schema: obj({ shelter: str, beds_used: { type: "integer" }, beds_total: { type: "integer" } }),
  },
  report_problem: {
    name: "report_problem",
    description: "The help desk. Use when something goes wrong while the person is on a task (vehicle broke down, road blocked, cannot find the place, short of stock, unsafe, someone hurt, shift ending), or to say an open problem is over (resolved true with its incident_id).",
    input_schema: obj({
      kind: { type: "string", enum: INCIDENT_KINDS },
      text: { ...str, description: "The person's own words, in their language, unchanged." },
      text_en: { ...str, description: "English translation." },
      task_id: { ...nstr, description: "The task in trouble, from the context." },
      can_continue: { type: "boolean", description: "Can they still finish the task themselves?" },
      can_deliver: { ...nint, description: "short_supply only: how many they can still bring." },
      resolved: { type: "boolean", description: "true only to close an open problem." },
      incident_id: { ...nstr, description: "Set when updating or resolving an open problem from the context." },
    }),
  },
  declare_work: {
    name: "declare_work",
    description: "The person says they are already doing something nobody assigned: 'I'm taking water to the school', 'we started digging at Çınar St.'. The desk records it so nobody else does it twice.",
    input_schema: obj({
      what: { type: "string", enum: ["call", "rescue", "deliver", "assist"] },
      text: { ...str, description: "The person's own words, in their language, unchanged." },
      text_en: { ...str, description: "English translation." },
      record_id: { ...nstr, description: "Only an id that appears in the context." },
      eta_minutes: nint,
    }),
  },
  correct_record: {
    name: "correct_record",
    description: "The person says the desk is wrong: a report is false (retract), or one value is wrong (edit one field).",
    input_schema: obj({
      action: { type: "string", enum: ["retract", "edit"] },
      record_type: { type: "string", enum: RECORD_TYPES },
      record_id: str,
      // Nullable enum: the API wants anyOf here, not type ["string","null"] + enum.
      field: { anyOf: [{ type: "string", enum: ["address", "peopleTrapped", "quantity", "bedsUsed", "bedsTotal", "state"] }, { type: "null" }] },
      value: { ...nstr, description: "The new value for field, as text." },
      reason: str,
    }),
  },
  decide_approval: {
    name: "decide_approval",
    description: "Coordinator only. Approve or reject a task that waits for approval. Only when the coordinator clearly said so.",
    input_schema: obj({ task_id: str, approved: { type: "boolean" }, reason: str }),
  },
  shift_handoff: {
    name: "shift_handoff",
    description: "Coordinator only. Write the shift handoff note for whoever takes over: what was done, what is open, what is stuck.",
    input_schema: obj({}),
  },
};

const ROLE_TOOLS: Record<Role, string[]> = {
  volunteer: ["ask_desk", "answer_task", "file_need", "file_report", "file_closure", "report_problem", "declare_work", "correct_record"],
  field: ["ask_desk", "answer_task", "file_need", "file_report", "file_closure", "report_problem", "declare_work", "correct_record"],
  supplier: ["ask_desk", "answer_task", "file_need", "file_closure", "report_problem", "declare_work"],
  shelter: ["ask_desk", "answer_task", "file_need", "file_report", "file_capacity", "report_problem", "correct_record"],
  coordinator: ["ask_desk", "decide_approval", "shift_handoff", "file_report", "file_closure", "file_need", "correct_record"],
  public: ["ask_desk", "file_need", "file_report", "file_closure"],
};

export function toolsFor(ctx: UserContext): Anthropic.Beta.BetaToolUnion[] {
  const tools: Anthropic.Beta.BetaToolUnion[] = ROLE_TOOLS[ctx.user.role].map((n) => ({ ...DEFS[n], strict: true }));
  // Web search only when a supplier or field team has an open problem: the help-desk lookup.
  // Billed per search, so it is offered only then, and capped at 2 searches per turn.
  if ((ctx.user.role === "supplier" || ctx.user.role === "field") && ctx.myIncidents.length > 0) {
    tools.push({ type: "web_search_20260209", name: "web_search", max_uses: 2,
      user_location: { type: "approximate", city: "Malatya", country: "TR" } });
  }
  return tools;
}

export interface ToolOutcome { content: string; eventId?: string; isError?: boolean; summary?: string }

class ToolInputError extends Error {}

/** Runs one tool call for one person. Never throws for bad input: returns an error result instead. */
export async function runTool(name: string, input: Record<string, unknown>, ctx: UserContext): Promise<ToolOutcome> {
  const role = ctx.user.role;
  if (!ROLE_TOOLS[role].includes(name)) return { content: `${name} is not available to the ${role} role.`, isError: true };
  try {
    return await run(name, input, ctx);
  } catch (e) {
    if (e instanceof ToolInputError) return { content: e.message, isError: true };
    throw e;
  }
}

const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const masked = (v: unknown) => (s(v) ? maskPhones(s(v)!).text : undefined);

function needId<T>(v: T | undefined, what: string): T {
  if (v === undefined) throw new ToolInputError(`${what} is required.`);
  return v;
}

async function post(ctx: UserContext, type: NewEvent["type"], payload: unknown, summary: string): Promise<ToolOutcome> {
  const id = await desk().postEvent({ deskId: ctx.user.deskId, type, source: "person", actor: ctx.user._id, payload,
    observedAt: new Date().toISOString() });
  return { content: `Filed as event ${id}. ${summary}. The desk processes it in a few seconds.`, eventId: id, summary };
}

async function run(name: string, i: Record<string, unknown>, ctx: UserContext): Promise<ToolOutcome> {
  const u = ctx.user;
  switch (name) {
    case "ask_desk": {
      const topic = s(i.topic) as Topic;
      if (!topicsFor(u.role).includes(topic)) {
        return { content: `Not available to the ${u.role} role. Allowed: ${topicsFor(u.role).join(", ")}.`, isError: true };
      }
      const d = desk();
      const [board, events] = await Promise.all([d.getBoard(u.deskId), d.recentEvents(u.deskId, 60)]);
      return { content: askDesk({ board, events, role: u.role, topic, region: s(i.region), now: ctx.now, near: u.coords,
        userId: u._id, page: n(i.page) }) };
    }

    case "answer_task": {
      const task = ctx.tasks.find((t) => t._id === s(i.task_id));
      if (!task) throw new ToolInputError(`Task ${String(i.task_id)} is not one of this person's open tasks: ${ctx.tasks.map((t) => t._id).join(", ") || "none"}.`);
      const p: AnswerPayload = { taskId: task._id, result: i.result as AnswerPayload["result"],
        note: masked(i.note), etaMinutes: n(i.eta_minutes) };
      return post(ctx, "answer", p, `Task "${task.title}" ${p.result}`);
    }

    case "file_need": {
      const quantity = Math.max(1, Math.round(needId(n(i.quantity), "quantity")));
      const siteId = s(i.site_id);
      const p: NeedPayload = { item: needId(s(i.item), "item"), quantity, lifeThreatening: i.life_threatening === true,
        siteId: siteId && ctx.records.sites.some((x) => x._id === siteId) ? siteId : undefined,
        region: s(i.region) ?? u.region, coords: u.coords };
      const wait = u.trust === "public" && !p.lifeThreatening
        ? " It stays 'proposed' until three different people ask for it." : "";
      return post(ctx, "need", p, `Need: ${quantity} ${p.item}${p.lifeThreatening ? ", life-threatening" : ""}${wait}`);
    }

    case "file_report": {
      const siteId = s(i.site_id);
      const p: ReportPayload = { kind: i.kind as ReportPayload["kind"], text: needId(masked(i.text), "text"),
        textEn: masked(i.text_en) ?? "", address: s(i.address), region: s(i.region) ?? u.region,
        peopleCount: n(i.people_count),
        siteId: u.role !== "public" && siteId && ctx.records.sites.some((x) => x._id === siteId) ? siteId : undefined };
      return post(ctx, "report", p, `Report: ${p.kind}${p.address ? ` at ${p.address}` : ""}`);
    }

    case "file_closure": {
      const p: ClosurePayload = { road: needId(s(i.road), "road"), state: i.state as ClosurePayload["state"],
        reason: s(i.reason) ?? "" };
      return post(ctx, "closure", p, `Road ${p.road}: ${p.state}`);
    }

    case "file_capacity": {
      const used = needId(n(i.beds_used), "beds_used"), total = needId(n(i.beds_total), "beds_total");
      if (used < 0 || total <= 0) throw new ToolInputError("beds_used must be ≥ 0 and beds_total > 0.");
      const p: CapacityPayload = { shelter: needId(s(i.shelter), "shelter"), bedsUsed: used, bedsTotal: total };
      return post(ctx, "capacity", p, `Shelter ${p.shelter}: ${used}/${total}`);
    }

    case "report_problem": {
      const taskId = s(i.task_id);
      if (taskId && !ctx.tasks.some((t) => t._id === taskId)) {
        throw new ToolInputError(`Task ${taskId} is not one of this person's open tasks.`);
      }
      const incidentId = s(i.incident_id);
      if (i.resolved === true && !incidentId) throw new ToolInputError("resolved needs the incident_id of an open problem.");
      if (incidentId && !ctx.myIncidents.some((x) => x._id === incidentId)) {
        throw new ToolInputError(`Incident ${incidentId} is not an open problem of this person.`);
      }
      // With one open task the problem is about it. With several, the model must say which.
      let forTask = taskId;
      if (!forTask && !incidentId && i.resolved !== true) {
        if (ctx.tasks.length === 1) forTask = ctx.tasks[0]._id;
        else if (ctx.tasks.length > 1 && i.can_continue !== true) {
          throw new ToolInputError(`Which task is in trouble? Ask the person. Open tasks: ${ctx.tasks.map((t) => `${t._id} (${t.title})`).join("; ")}.`);
        }
      }
      const p: IncidentPayload = { kind: i.kind as IncidentKind, text: needId(masked(i.text), "text"),
        textEn: masked(i.text_en) ?? "", taskId: forTask,
        canContinue: i.can_continue === true, coords: u.coords, canDeliver: n(i.can_deliver),
        resolved: i.resolved === true ? true : undefined, incidentId };
      return post(ctx, "incident", p, p.resolved ? `Problem ${incidentId} resolved` : `Problem: ${p.kind}${p.taskId ? ` on task ${p.taskId}` : ""}`);
    }

    case "declare_work": {
      if (u.trust === "public") throw new ToolInputError("Only vetted or official people can declare work.");
      const rid = s(i.record_id);
      const known = rid && ([...ctx.records.sites, ...ctx.records.needs].some((x) => x._id === rid) ||
        ctx.tasks.some((t) => t.recordId === rid));
      const p: ClaimPayload = { what: i.what as ClaimPayload["what"], text: needId(masked(i.text), "text"),
        textEn: masked(i.text_en) ?? "", recordId: known ? rid : undefined, etaMinutes: n(i.eta_minutes) };
      return post(ctx, "claim", p, `Declared work: ${p.what}`);
    }

    case "correct_record": {
      const field = s(i.field);
      if (i.action === "edit" && (!field || s(i.value) === undefined)) throw new ToolInputError("edit needs field and value.");
      const raw = s(i.value);
      const value = raw !== undefined && /^-?\d+$/.test(raw) ? Number(raw) : raw;
      const p: CorrectionPayload = { action: i.action as "retract" | "edit", recordType: i.record_type as RecordType,
        recordId: needId(s(i.record_id), "record_id"), fields: field ? { [field]: value } : undefined,
        reason: needId(s(i.reason), "reason") };
      return post(ctx, "correction", p, `Correction: ${p.action} ${p.recordType} ${p.recordId}`);
    }

    case "decide_approval": {
      if (u.role !== "coordinator") throw new ToolInputError("Only a coordinator can approve.");
      const task = ctx.approvals.find((t) => t._id === s(i.task_id));
      if (!task) throw new ToolInputError(`Task ${String(i.task_id)} is not waiting for approval. Waiting: ${ctx.approvals.map((t) => t._id).join(", ") || "none"}.`);
      const p: ApprovalPayload = { taskId: task._id, approved: i.approved === true };
      return post(ctx, "approval", p, `${p.approved ? "Approved" : "Rejected"}: ${task.title}`);
    }

    case "shift_handoff": {
      if (u.role !== "coordinator") throw new ToolInputError("Only a coordinator can write the handoff.");
      const note = await writeHandoff(u.deskId, ctx.now);
      if (!note.ok) return { content: note.text, isError: true, summary: "Handoff failed" };
      return { content: note.text, summary: "Handoff written" };
    }
  }
  return { content: `Unknown tool ${name}.`, isError: true };
}
