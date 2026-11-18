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

import { assertBudget, recordMissingUsage, recordUsage, type UsageLike } from "./cost";
import { assertModelHost, baseUrl, hostOf, US_HOST } from "./model-host";

export { assertModelHost, baseUrl, DEFAULT_BASE_URL, ModelHostError, US_HOST } from "./model-host";

export type Effort = "low" | "medium" | "high";
export type Purpose = "chat" | "extract" | "summary" | "digest" | "vision";


const DEFAULTS: Record<Purpose, { model: string; effort: Effort }> = {
  chat: { model: "openai/gpt-oss-120b", effort: "low" },
  extract: { model: "openai/gpt-oss-120b", effort: "low" },
  summary: { model: "openai/gpt-oss-120b", effort: "medium" },
  digest: { model: "openai/gpt-oss-20b", effort: "low" },
  // D-0016: one open-weight vision model, used only to describe a photo into text.
  // Provisional id: confirm the US-region endpoint + live price on the smoke run (issue #39).
  vision: { model: "nvidia/nemotron-3.5-super-vl", effort: "low" },
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

/** For GET /api/health: which host and models the agents use. No key, no path, no credentials. */
export function modelInfo(): { host: string; usOnly: boolean; models: Record<Purpose, string> } {
  const host = hostOf(baseUrl()) ?? "invalid";
  return {
    host,
    usOnly: host === US_HOST,
    models: { chat: modelFor("chat").model, extract: modelFor("extract").model, summary: modelFor("summary").model, digest: modelFor("digest").model, vision: modelFor("vision").model },
  };
}

// ── Chat completions types (the subset we use) ────────────────────────────────────────────────

export interface ToolCall { id: string; type: "function"; function: { name: string; arguments: string } }
export interface FunctionTool {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown>; strict?: boolean };
}
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };
export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | ContentPart[] }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[]; reasoning?: string; reasoning_details?: unknown[] }
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
  /** Undefined when the response had no usage block (recorded as a pessimistic estimate). */
  usage?: UsageLike;
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

/** Size of the request as sent: an upper bound on its prompt tokens, for pricing a call with no usage. */
function requestChars(params: ChatParams, stream: boolean): number {
  return body(params, stream).length;
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

const retryStatus = (s: number) => s === 408 || s === 429 || (s >= 500 && s <= 599);
export const MAX_RETRIES = 2;
/** max_tokens assumed when pricing a response with no usage and no max_tokens in the request. */
const DEFAULT_MAX_TOKENS = 16_000;
const TIMEOUT_MS = 120_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** POST with a timeout, retrying 408, 429, any 5xx and network errors (2 retries, Retry-After honoured, at most 10 s). */
async function post(params: ChatParams, stream: boolean): Promise<Response> {
  assertModelHost();
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
    const retryable = !res || retryStatus(res.status);
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
  message?: { content?: string | null; refusal?: string | null; tool_calls?: ToolCall[] | null;
    reasoning?: string | null; reasoning_details?: unknown[] | null };
}
interface WireResponse { model?: string; choices?: WireChoice[]; usage?: UsageLike; error?: { message?: string; code?: number } }

function result(model: string, choice: WireChoice | undefined, usage: UsageLike | undefined, served?: string): ChatResult {
  const toolCalls = (choice?.message?.tool_calls ?? []).map((c, i) => ({
    id: c.id || `call_${i}`, type: "function" as const, function: { name: c.function.name, arguments: c.function.arguments ?? "" },
  }));
  const text = choice?.message?.content ?? "";
  const refused = !!choice?.message?.refusal;
  // Reasoning goes back on the assistant message so the model keeps its thread across tool rounds.
  // OpenRouter's reasoning-tokens guide: pass reasoning_details unmodified, or the plaintext as `reasoning`
  // ("Preserving reasoning blocks is useful specifically for tool calling"). It names no gpt-oss specifics:
  // confirm with the live smoke run (issue #5).
  const details = choice?.message?.reasoning_details;
  const reasoning = choice?.message?.reasoning;
  return {
    message: {
      role: "assistant", content: text || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      ...(details?.length ? { reasoning_details: details } : reasoning ? { reasoning } : {}),
    },
    text,
    toolCalls,
    finishReason: refused ? "content_filter" : choice?.finish_reason ?? "stop",
    model: served ?? model,
    usage,
  };
}

/**
 * Record what a call cost: its usage when the response had one, else a pessimistic estimate. Runs
 * before any error is thrown for a response that came back, so the budget never undercounts.
 */
function charge(label: string, params: ChatParams, stream: boolean, usage: UsageLike | undefined, served?: string): void {
  if (usage) recordUsage(label, params.model, usage, served ?? params.model);
  else recordMissingUsage(label, params.model, params.max_tokens ?? DEFAULT_MAX_TOKENS, requestChars(params, stream), served);
}

/** Record the cost, then throw on a finish_reason "error". */
function settle(label: string, params: ChatParams, stream: boolean, out: ChatResult): ChatResult {
  charge(label, params, stream, out.usage, out.model);
  if (out.finishReason === "error") throw new LlmError(`${label}: the provider ended the response with an error`);
  return out;
}

/** Check the budget, send, record the cost. Every model call in agents/ goes through here. */
export async function send(label: string, params: ChatParams): Promise<ChatResult> {
  assertBudget(label);
  const res = await post(params, false);
  const raw = await res.text();
  let json: WireResponse;
  try { json = JSON.parse(raw) as WireResponse; } catch {
    charge(label, params, false, undefined);   // a 200 may still have been billed
    throw new LlmError(`OpenRouter: response is not JSON (${raw.slice(0, 120)})`, res.status);
  }
  if (json.error) {
    charge(label, params, false, json.usage, json.model);
    throw new LlmError(`OpenRouter: ${json.error.message ?? "error"}`, json.error.code);
  }
  return settle(label, params, false, result(params.model, json.choices?.[0], json.usage, json.model));
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
  let reasoning = "";
  let finish: string | undefined;
  let served: string | undefined;
  let usage: UsageLike | undefined;
  const calls: { id: string; name: string; args: string }[] = [];

  const onEvent = (data: string) => {
    if (data === "[DONE]") return;
    let chunk: WireResponse & { choices?: (WireChoice & { delta?: {
      content?: string | null; refusal?: string | null; reasoning?: string | null;
      tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[];
    } })[] };
    try { chunk = JSON.parse(data); } catch { return; }
    served = chunk.model ?? served;
    if (chunk.usage) usage = chunk.usage;
    if (chunk.error) throw new LlmError(`OpenRouter: ${chunk.error.message ?? "stream error"}`, chunk.error.code);
    const c = chunk.choices?.[0];
    if (!c) return;
    const d = c.delta;
    if (d?.content) { text += d.content; onText(d.content); }
    if (d?.refusal) refusal += d.refusal;
    if (d?.reasoning) reasoning += d.reasoning;
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
  try {
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
  } catch (e) {
    await reader.cancel().catch(() => undefined);   // free the connection
    charge(label, params, true, usage, served);      // what came so far was billed: record it first
    throw e;
  }

  // A streamed call without an id (some providers omit it) gets call_<index>, so its tool message matches.
  const toolCalls = calls.flatMap((c, i) => (c ? [{ id: c.id || `call_${i}`, type: "function" as const,
    function: { name: c.name, arguments: c.args } }] : []));
  // Streamed reasoning_details come in fragments; the plaintext `reasoning` is what we send back.
  return settle(label, params, true, result(params.model, {
    finish_reason: finish ?? (toolCalls.length ? "tool_calls" : "stop"),
    message: { content: text, refusal: refusal || null, tool_calls: toolCalls, reasoning: reasoning || null },
  }, usage, served));
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

/**
 * D-0016: describe a photo into text. Sends an OpenAI-format image content part to the vision model
 * and returns its words. The caller files the description, never this function. If the vision call
 * fails for any reason, return undefined so the caller falls back to "no description".
 */
export async function describeImage(opts: { mediaType: string; base64: string; system?: string }): Promise<string | undefined> {
  const { model, effort } = modelFor("vision");
  const dataUrl = `data:${opts.mediaType};base64,${opts.base64}`;
  try {
    const res = await send("describe-image", {
      model, effort, max_tokens: 1000,
      messages: [
        { role: "system", content: opts.system ?? "Describe what this photo shows, in plain prose, for a dispatcher. Name what you see (damage, people, numbers, hazards), and say you are unsure where you are unsure." },
        { role: "user", content: [{ type: "image_url", image_url: { url: dataUrl } }] },
      ],
    });
    if (!res.text.trim()) return undefined;
    return res.text;
  } catch {
    return undefined;
  }
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
