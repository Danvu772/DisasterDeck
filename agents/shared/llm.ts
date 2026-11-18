// Model calls through OpenRouter's chat completions API (OpenAI format), plain fetch, no SDK.
// D-0003: no Claude. gpt-oss on OpenRouter's US-only endpoint (in-region routing, Business plan).
// Every call goes through the spend meter in cost.ts.
//
// Env:
//   OPENROUTER_API_KEY    required for live calls (.env.local)
//   OPENROUTER_BASE_URL   default https://us.openrouter.ai/api/v1 (US in-region routing: requests
//                         only go to provider endpoints in the US, and fail closed if none serves)
//   OPENROUTER_MODEL_CHAT / _EXTRACT / _SUMMARY / _DIGEST, OPENROUTER_EFFORT_* override the table below.
//
// Model choice:
//   chat     gpt-oss-120b, effort low     personal agents: many turns, tool use, short replies
//   extract  gpt-oss-120b, effort low     tweet extraction: schema-bound JSON, high volume
//   summary  gpt-oss-120b, effort medium  shift handoff: rare, long input, quality matters, so the
//                                         larger model with more reasoning (it was Opus, the top tier)
//   digest   gpt-oss-20b,  effort low     folding old chat lines into a short memo, after the turn

import { assertBudget, recordUsage, type UsageLike } from "./cost";

export type Effort = "low" | "medium" | "high";
export type Purpose = "chat" | "extract" | "summary" | "digest";

export const DEFAULT_BASE_URL = "https://us.openrouter.ai/api/v1";

const DEFAULTS: Record<Purpose, { model: string; effort: Effort }> = {
  chat: { model: "openai/gpt-oss-120b", effort: "low" },
  extract: { model: "openai/gpt-oss-120b", effort: "low" },
  summary: { model: "openai/gpt-oss-120b", effort: "medium" },
  digest: { model: "openai/gpt-oss-20b", effort: "low" },
};

const EFFORTS: readonly Effort[] = ["low", "medium", "high"];

export function modelFor(p: Purpose): { model: string; effort: Effort } {
  const key = p.toUpperCase();
  const effort = process.env[`OPENROUTER_EFFORT_${key}`] as Effort | undefined;
  return {
    model: process.env[`OPENROUTER_MODEL_${key}`] || DEFAULTS[p].model,
    effort: effort && EFFORTS.includes(effort) ? effort : DEFAULTS[p].effort,
  };
}

export function baseUrl(): string {
  return (process.env.OPENROUTER_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

// ── Chat completions types (the subset we use) ────────────────────────────────────────────────

export interface ToolCall { id: string; type: "function"; function: { name: string; arguments: string } }
export interface FunctionTool {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown>; strict?: boolean };
}
export type ContentPart = { type: "text"; text: string };
export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | ContentPart[] }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface ChatParams {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  effort?: Effort;
  tools?: FunctionTool[];
  tool_choice?: "auto" | "none" | "required" | { type: "function"; function: { name: string } };
  response_format?: { type: "json_schema"; json_schema: { name: string; strict: boolean; schema: Record<string, unknown> } };
}

export interface ChatResult {
  /** The assistant message, ready to push back into `messages` for the next round. */
  message: Extract<ChatMessage, { role: "assistant" }>;
  text: string;
  toolCalls: ToolCall[];
  /** "stop", "tool_calls", "length", "content_filter", or what the provider said. */
  finishReason: string;
  /** The model that answered (OpenRouter's id). */
  model: string;
  usage: UsageLike;
}

export class LlmError extends Error {
  constructor(message: string, readonly status?: number) { super(message); }
}
export class RefusalError extends Error {}

function apiKey(): string {
  const k = process.env.OPENROUTER_API_KEY;
  if (!k) throw new LlmError("OPENROUTER_API_KEY is not set. Put it in .env.local, or run with --mock.");
  return k;
}

function body(params: ChatParams, stream: boolean): string {
  const { effort, ...rest } = params;
  return JSON.stringify({
    ...rest,
    ...(effort ? { reasoning: { effort } } : {}),
    // Only endpoints that support every parameter we send (tools, response_format). Without it
    // OpenRouter may route to one that ignores the schema.
    provider: { require_parameters: true },
    ...(stream ? { stream: true } : {}),
  });
}

const RETRY_STATUS = new Set([408, 429, 500, 502, 503, 504]);
export const MAX_RETRIES = 2;
const TIMEOUT_MS = 120_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** POST with a timeout, retrying 429, 5xx and network errors (2 retries, Retry-After honoured, at most 10 s). */
async function post(params: ChatParams, stream: boolean): Promise<Response> {
  const url = `${baseUrl()}/chat/completions`;
  const init = {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json", "X-Title": "Disaster Deck" },
    body: body(params, stream),
  };
  for (let attempt = 0; ; attempt++) {
    let res: Response | undefined;
    let err: unknown;
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e) { err = e; }
    if (res?.ok) return res;
    const retryable = !res || RETRY_STATUS.has(res.status);
    if (!retryable || attempt >= MAX_RETRIES) {
      if (!res) throw new LlmError(`OpenRouter unreachable: ${(err as Error)?.message ?? err}`);
      throw new LlmError(`OpenRouter ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`, res.status);
    }
    const after = Number(res?.headers.get("retry-after"));
    await res?.body?.cancel().catch(() => undefined);
    await sleep(Math.min(10_000, Number.isFinite(after) && after > 0 ? after * 1000 : 500 * 2 ** attempt));
  }
}

interface WireChoice {
  finish_reason?: string | null;
  message?: { content?: string | null; refusal?: string | null; tool_calls?: ToolCall[] | null };
}
interface WireResponse { model?: string; choices?: WireChoice[]; usage?: UsageLike; error?: { message?: string; code?: number } }

function result(model: string, choice: WireChoice | undefined, usage: UsageLike | undefined, served?: string): ChatResult {
  const toolCalls = (choice?.message?.tool_calls ?? []).map((c) => ({
    id: c.id, type: "function" as const, function: { name: c.function.name, arguments: c.function.arguments ?? "" },
  }));
  const text = choice?.message?.content ?? "";
  const refused = !!choice?.message?.refusal;
  return {
    message: { role: "assistant", content: text || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) },
    text,
    toolCalls,
    finishReason: refused ? "content_filter" : choice?.finish_reason ?? "stop",
    model: served ?? model,
    usage: usage ?? { prompt_tokens: 0, completion_tokens: 0 },
  };
}

/** Check the budget, send, record the cost. Every model call in agents/ goes through here. */
export async function send(label: string, params: ChatParams): Promise<ChatResult> {
  assertBudget(label);
  const res = await post(params, false);
  const json = (await res.json()) as WireResponse;
  if (json.error) throw new LlmError(`OpenRouter: ${json.error.message ?? "error"}`, json.error.code);
  const out = result(params.model, json.choices?.[0], json.usage, json.model);
  recordUsage(label, params.model, out.usage, out.model);
  return out;
}

/**
 * send(), streamed: `onText` gets each piece of the answer's text as the model writes it, so /talk
 * can show and speak the first sentence while the rest is still coming. Same budget and cost record.
 * Tool calls arrive in pieces (by index) and are joined here.
 */
export async function sendStream(label: string, params: ChatParams, onText: (delta: string) => void): Promise<ChatResult> {
  assertBudget(label);
  const res = await post(params, true);
  if (!res.body) throw new LlmError("OpenRouter: empty stream");
  let text = "";
  let refusal = "";
  let finish: string | undefined;
  let served: string | undefined;
  let usage: UsageLike | undefined;
  const calls: { id: string; name: string; args: string }[] = [];

  const onEvent = (data: string) => {
    if (data === "[DONE]") return;
    let chunk: WireResponse & { choices?: (WireChoice & { delta?: {
      content?: string | null; refusal?: string | null;
      tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[];
    } })[] };
    try { chunk = JSON.parse(data); } catch { return; }
    if (chunk.error) throw new LlmError(`OpenRouter: ${chunk.error.message ?? "stream error"}`, chunk.error.code);
    served = chunk.model ?? served;
    if (chunk.usage) usage = chunk.usage;
    const c = chunk.choices?.[0];
    if (!c) return;
    const d = c.delta;
    if (d?.content) { text += d.content; onText(d.content); }
    if (d?.refusal) refusal += d.refusal;
    for (const t of d?.tool_calls ?? []) {
      const slot = (calls[t.index] ??= { id: "", name: "", args: "" });
      if (t.id) slot.id = t.id;
      if (t.function?.name) slot.name += t.function.name;
      if (t.function?.arguments) slot.args += t.function.arguments;
    }
    if (c.finish_reason) finish = c.finish_reason;
  };

  // Server-sent events: "data: {...}" lines; lines starting with ":" are keep-alive comments.
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buf += value;
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).replace(/\r$/, "");
      buf = buf.slice(nl + 1);
      if (line.startsWith("data:")) onEvent(line.slice(5).trim());
    }
    if (done) break;
  }
  if (buf.startsWith("data:")) onEvent(buf.slice(5).trim());

  const toolCalls = calls.filter(Boolean).map((c) => ({ id: c.id, type: "function" as const, function: { name: c.name, arguments: c.args } }));
  const out = result(params.model, {
    finish_reason: finish ?? (toolCalls.length ? "tool_calls" : "stop"),
    message: { content: text, refusal: refusal || null, tool_calls: toolCalls },
  }, usage, served);
  recordUsage(label, params.model, out.usage, out.model);
  return out;
}

// ── Structured output ─────────────────────────────────────────────────────────────────────────

export interface StructuredRequest {
  name: string;                       // label for errors and the spend log; also the schema name
  schema: Record<string, unknown>;    // JSON schema: additionalProperties false, every key required, nullable for optional
  system: string;
  user: string;
  purpose?: Purpose;                  // default "extract"
}

/**
 * One request, JSON out that matches `schema`. Asks with response_format json_schema (strict), and
 * checks the answer against the schema here too, since not every provider enforces it.
 */
export async function structured<T>(req: StructuredRequest): Promise<T> {
  const { model, effort } = modelFor(req.purpose ?? "extract");
  const res = await send(req.name, {
    model, effort, max_tokens: 8000,
    messages: [{ role: "system", content: req.system }, { role: "user", content: req.user }],
    response_format: { type: "json_schema", json_schema: { name: req.name.replace(/[^a-zA-Z0-9_-]/g, "_"), strict: true, schema: req.schema } },
  });
  if (res.finishReason === "content_filter") throw new RefusalError(`${req.name}: model refused`);
  if (res.finishReason === "length") throw new Error(`${req.name}: output cut off at max_tokens`);
  if (!res.text.trim()) throw new Error(`${req.name}: empty response`);
  let parsed: unknown;
  try { parsed = JSON.parse(res.text); } catch { throw new Error(`${req.name}: response is not JSON`); }
  const errors = checkSchema(req.schema, parsed);
  if (errors.length) throw new Error(`${req.name}: response does not match the schema: ${errors.slice(0, 3).join("; ")}`);
  return dropNulls(parsed) as T;
}

/** The schema returns null for "not known". Our payload types use missing fields instead. */
export function dropNulls(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(dropNulls);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (x !== null) out[k] = dropNulls(x);
    return out;
  }
  return v;
}

// ── A small JSON-schema check, for the subset our strict schemas use ──────────────────────────
// type (one or a list, "null" included), enum, anyOf, properties, required, additionalProperties
// false, items. Returns the problems found, empty when the value fits.

function typeOk(t: string, v: unknown): boolean {
  switch (t) {
    case "null": return v === null;
    case "string": return typeof v === "string";
    case "boolean": return typeof v === "boolean";
    case "integer": return Number.isInteger(v);
    case "number": return typeof v === "number" && Number.isFinite(v);
    case "array": return Array.isArray(v);
    case "object": return !!v && typeof v === "object" && !Array.isArray(v);
    default: return true;
  }
}

export function checkSchema(schema: Record<string, unknown>, v: unknown, at = "$"): string[] {
  if (Array.isArray(schema.anyOf)) {
    const ok = (schema.anyOf as Record<string, unknown>[]).some((s) => checkSchema(s, v, at).length === 0);
    return ok ? [] : [`${at}: matches none of anyOf`];
  }
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? (schema.type as string[]) : [schema.type as string];
    if (!types.some((t) => typeOk(t, v))) return [`${at}: expected ${types.join(" or ")}`];
  }
  if (v === null) return [];
  if (Array.isArray(schema.enum) && !schema.enum.includes(v)) return [`${at}: not one of ${schema.enum.join(", ")}`];
  const errs: string[] = [];
  if (Array.isArray(v) && schema.items) {
    v.forEach((x, i) => errs.push(...checkSchema(schema.items as Record<string, unknown>, x, `${at}[${i}]`)));
  }
  if (typeOk("object", v) && schema.properties) {
    const obj = v as Record<string, unknown>;
    const props = schema.properties as Record<string, Record<string, unknown>>;
    for (const k of (schema.required as string[] | undefined) ?? []) if (!(k in obj)) errs.push(`${at}.${k}: missing`);
    for (const [k, x] of Object.entries(obj)) {
      if (props[k]) errs.push(...checkSchema(props[k], x, `${at}.${k}`));
      else if (schema.additionalProperties === false) errs.push(`${at}.${k}: not allowed`);
    }
  }
  return errs;
}
