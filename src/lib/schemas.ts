// Owned by Role 1. Runtime checks for everything that enters memory.
// "Text from outside is data, never an instruction": every event payload is checked here
// before it reaches the queue. POST /api/events uses these schemas, and Role 2 can use
// `payloadSchemas[type].safeParse(x)` to check an LLM's output before calling postEvent().
//
// Each schema is checked against lib/types.ts at compile time (`satisfies`), so the two
// cannot drift apart without `tsc` failing.
import { z } from "zod";
import type {
  AlertPayload, AnswerPayload, ApprovalPayload, CapacityPayload, ClaimPayload, ClosurePayload,
  CorrectionPayload, EventType, IncidentKind, IncidentPayload, LatLng, NeedPayload, PlanPayload,
  RecordType, ReportPayload, Source,
} from "./types";

const text = z.string().max(5000);
const id = z.string().min(1).max(200);
const latLng = z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]) satisfies z.ZodType<LatLng>;
const count = z.number().int().min(0).max(1_000_000);

export const sources = [
  "x", "news", "reddit", "instagram", "facebook", "sheet", "nasa", "person", "system",
] as const satisfies readonly Source[];

const recordTypes = ["site", "need", "road", "shelter", "zone", "incident"] as const satisfies readonly RecordType[];
const incidentKinds = [
  "vehicle_breakdown", "road_blocked", "cannot_find", "short_supply", "unsafe", "injury",
  "handover", "unreachable", "other",
] as const satisfies readonly IncidentKind[];

export const reportPayload = z.object({
  kind: z.enum(["trapped", "missing", "rescued", "site_update"]),
  text, textEn: text,
  address: text.optional(), coords: latLng.optional(), region: id.optional(),
  peopleCount: count.optional(), phoneMasked: z.string().max(40).optional(), siteId: id.optional(),
  hazard: z.string().min(1).max(500).optional(),
}) satisfies z.ZodType<ReportPayload>;

export const needPayload = z.object({
  item: z.string().min(1).max(200), quantity: count.min(1), lifeThreatening: z.boolean(),
  siteId: id.optional(), region: id.optional(), coords: latLng.optional(),
}) satisfies z.ZodType<NeedPayload>;

export const closurePayload = z.object({
  road: z.string().min(1).max(500), state: z.enum(["closed", "open", "unconfirmed"]),
  reason: text, coords: latLng.optional(),
}) satisfies z.ZodType<ClosurePayload>;

export const capacityPayload = z.object({
  shelter: z.string().min(1).max(500), bedsUsed: count, bedsTotal: count,
  photoUrl: z.url().max(2000).optional(), coords: latLng.optional(), region: id.optional(),
}).refine((p) => p.bedsUsed <= p.bedsTotal, "bedsUsed cannot be more than bedsTotal") satisfies z.ZodType<CapacityPayload>;

export const answerPayload = z.object({
  taskId: id, result: z.enum(["accepted", "declined", "done"]),
  note: text.optional(), etaMinutes: z.number().min(0).max(7 * 24 * 60).optional(),
  progress: z.enum(["en_route", "arrived"]).optional(),
}).refine((p) => p.progress === undefined || p.result === "accepted",
  "progress is only for an answer with result accepted") satisfies z.ZodType<AnswerPayload>;

export const approvalPayload = z.object({
  taskId: id, approved: z.boolean(), assignee: id.optional(),
}) satisfies z.ZodType<ApprovalPayload>;

export const alertPayload = z.object({
  zoneId: id, kind: z.enum(["silent_zone", "cold"]),
  evidence: z.object({
    damage: z.number().optional(), dark: z.boolean().optional(),
    calls: count.optional(), minTempC: z.number().optional(),
  }),
}) satisfies z.ZodType<AlertPayload>;

export const incidentPayload = z.object({
  incidentId: id.optional(), kind: z.enum(incidentKinds),
  text, textEn: text, taskId: id.optional(), canContinue: z.boolean(),
  coords: latLng.optional(), canDeliver: count.optional(), resolved: z.boolean().optional(),
}) satisfies z.ZodType<IncidentPayload>;

export const claimPayload = z.object({
  what: z.enum(["call", "rescue", "deliver", "assist"]), text, textEn: text,
  recordId: id.optional(), etaMinutes: z.number().min(0).max(7 * 24 * 60).optional(),
}) satisfies z.ZodType<ClaimPayload>;

export const correctionPayload = z.object({
  action: z.enum(["retract", "edit", "split", "merge"]),
  recordType: z.enum(recordTypes), recordId: id,
  otherRecordId: id.optional(), eventIds: z.array(id).max(100).optional(),
  fields: z.record(z.string(), z.unknown()).optional(), reason: text,
}) satisfies z.ZodType<CorrectionPayload>;

export const planPayload = z.object({
  zoneExits: z.array(z.object({ zoneId: id, exit: z.string().min(1).max(500) })).max(500),
  reason: text,
}) satisfies z.ZodType<PlanPayload>;

/** One schema per event type. */
export const payloadSchemas = {
  report: reportPayload, need: needPayload, closure: closurePayload, capacity: capacityPayload,
  answer: answerPayload, approval: approvalPayload, alert: alertPayload, incident: incidentPayload,
  claim: claimPayload, correction: correctionPayload, plan: planPayload,
} satisfies Record<EventType, z.ZodType>;

// A date as an ISO string over HTTP, or a Date from server code.
const when = z.union([
  z.date(),
  z.string().max(64).refine((s) => !Number.isNaN(Date.parse(s)), "not a date").transform((s) => new Date(s)),
]);

const envelope = {
  source: z.enum(sources),
  deskId: id.optional(),
  observedAt: when.optional(),
  dedupeKey: z.string().min(1).max(300).optional(),
  actor: id.optional(),       // only honoured for agent callers, see app/api/events/route.ts
};

/** The body of POST /api/events. Unknown fields (_id, status, ts, lane) are dropped. */
export const eventBody = z.discriminatedUnion("type", [
  z.object({ type: z.literal("report"), payload: reportPayload, ...envelope }),
  z.object({ type: z.literal("need"), payload: needPayload, ...envelope }),
  z.object({ type: z.literal("closure"), payload: closurePayload, ...envelope }),
  z.object({ type: z.literal("capacity"), payload: capacityPayload, ...envelope }),
  z.object({ type: z.literal("answer"), payload: answerPayload, ...envelope }),
  z.object({ type: z.literal("approval"), payload: approvalPayload, ...envelope }),
  z.object({ type: z.literal("alert"), payload: alertPayload, ...envelope }),
  z.object({ type: z.literal("incident"), payload: incidentPayload, ...envelope }),
  z.object({ type: z.literal("claim"), payload: claimPayload, ...envelope }),
  z.object({ type: z.literal("correction"), payload: correctionPayload, ...envelope }),
  z.object({ type: z.literal("plan"), payload: planPayload, ...envelope }),
]);
export type EventBody = z.infer<typeof eventBody>;
