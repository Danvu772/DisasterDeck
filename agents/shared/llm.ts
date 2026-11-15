// Claude calls through the official Anthropic SDK (@anthropic-ai/sdk).
// Key: ANTHROPIC_API_KEY in .env.local. Every call goes through the spend meter in cost.ts.
//
// Model choice (about $20 of credit for the whole weekend):
//   chat     Claude Sonnet 5.5, effort low   personal agents: many turns, tool use, short replies
//   extract  Claude Sonnet 5.5, effort low   tweet and news extraction: easy, high volume
//   summary  Claude Opus 5.5, effort medium  shift handoff: rare, long input, quality matters
//   digest   Claude Haiku 5.5, effort low    folding old chat lines into a short memo, after the turn
// Override any of them with ANTHROPIC_MODEL_CHAT / _EXTRACT / _SUMMARY and ANTHROPIC_EFFORT_*.

import Anthropic from "@anthropic-ai/sdk";
import { assertBudget, recordUsage } from "./cost";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export type Purpose = "chat" | "extract" | "summary" | "digest";

const DEFAULTS: Record<Purpose, { model: string; effort: Effort }> = {
  chat: { model: "claude-sonnet-5-5", effort: "low" },
  extract: { model: "claude-sonnet-5-5", effort: "low" },
  summary: { model: "claude-opus-5-5", effort: "medium" },
  digest: { model: "claude-haiku-5-5", effort: "low" },
};

export function modelFor(p: Purpose): { model: string; effort: Effort } {
  const key = p.toUpperCase();
  return {
    model: process.env[`ANTHROPIC_MODEL_${key}`] ?? DEFAULTS[p].model,
    effort: (process.env[`ANTHROPIC_EFFORT_${key}`] as Effort | undefined) ?? DEFAULTS[p].effort,
  };
}

/**
 * Safety classifiers can decline a request (stop_reason "refusal"). With this beta the API
 * re-runs the same request on a fallback model inside the same call. On Sonnet 5.5 the
 * "default" fallback covers only some categories (cyber, frontier_llm), not general_harms, which
 * a disaster report ("person trapped, bleeding") could trip. So send() also retries once itself,
 * on Claude Opus 5.5, whose classifiers do not include general_harms.
 */
export const FALLBACK: Pick<Anthropic.Beta.MessageCreateParamsNonStreaming, "betas" | "fallbacks"> = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
};

let client: Anthropic | undefined;
export function claude(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set. Put it in .env.local, or run with --mock.");
  }
  // The SDK retries 429, 5xx and connection errors itself (2 retries).
  return (client ??= new Anthropic({ maxRetries: 2, timeout: 120_000 }));
}

export class RefusalError extends Error {}

const RETRY_MODEL = "claude-opus-5-5";
const NOT_RETRYABLE = new Set(["cyber", "frontier_llm", "reasoning_extraction", "bio"]);

/** Check the budget, send, record the cost. Every Claude call in agents/ goes through here. */
export async function send(
  label: string,
  params: Omit<Anthropic.Beta.MessageCreateParamsNonStreaming, "betas" | "fallbacks">,
): Promise<Anthropic.Beta.BetaMessage> {
  assertBudget(label);
  // Claude Haiku 5.5 has no server-side fallback: the docs say not to send `fallbacks` to it.
  const fallback = String(params.model).startsWith("claude-haiku") ? {} : FALLBACK;
  const res = await claude().beta.messages.create({ ...params, ...fallback });
  recordUsage(label, String(params.model), res.usage, res.model);
  if (res.stop_reason !== "refusal") return res;

  const category = res.stop_details?.category ?? null;
  const fallbackRan = (res.usage.iterations ?? []).some((it) => it.type === "fallback_message");
  if (fallbackRan || params.model === RETRY_MODEL || (category && NOT_RETRYABLE.has(category))) return res;
  assertBudget(`${label}:retry`);
  const retry = await claude().beta.messages.create({ ...params, model: RETRY_MODEL, ...FALLBACK });
  recordUsage(`${label}:retry`, RETRY_MODEL, retry.usage, retry.model);
  return retry;
}

/**
 * send(), streamed: `onText` gets each piece of the answer's text as the model writes it, so /talk
 * can show and speak the first sentence while the rest is still coming. Same budget, cost record
 * and refusal handling. A refusal retry is not streamed (the refused attempt wrote no text).
 */
export async function sendStream(
  label: string,
  params: Omit<Anthropic.Beta.MessageCreateParamsNonStreaming, "betas" | "fallbacks">,
  onText: (delta: string) => void,
): Promise<Anthropic.Beta.BetaMessage> {
  assertBudget(label);
  const fallback = String(params.model).startsWith("claude-haiku") ? {} : FALLBACK;
  const stream = claude().beta.messages.stream({ ...params, ...fallback });
  stream.on("text", (d) => onText(d));
  const res = await stream.finalMessage();
  recordUsage(label, String(params.model), res.usage, res.model);
  if (res.stop_reason !== "refusal") return res;

  const category = res.stop_details?.category ?? null;
  const fallbackRan = (res.usage.iterations ?? []).some((it) => it.type === "fallback_message");
  if (fallbackRan || params.model === RETRY_MODEL || (category && NOT_RETRYABLE.has(category))) return res;
  assertBudget(`${label}:retry`);
  const retry = await claude().beta.messages.create({ ...params, model: RETRY_MODEL, ...FALLBACK });
  recordUsage(`${label}:retry`, RETRY_MODEL, retry.usage, retry.model);
  return retry;
}

export interface StructuredRequest {
  name: string;                       // label for errors and the spend log
  schema: Record<string, unknown>;    // JSON schema: additionalProperties false, every key required, nullable for optional
  system: string;
  user: string;
  purpose?: Purpose;                  // default "extract"
}

/** One request, JSON out that matches `schema`. */
export async function structured<T>(req: StructuredRequest): Promise<T> {
  const { model, effort } = modelFor(req.purpose ?? "extract");
  const response = await send(req.name, {
    model,
    max_tokens: 8000,
    // Same prompt for every tweet: cached after the first call.
    system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: req.user }],
    output_config: { effort, format: { type: "json_schema", schema: req.schema } },
  });
  if (response.stop_reason === "refusal") {
    throw new RefusalError(`${req.name}: model refused (${response.stop_details?.category ?? "no category"})`);
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error(`${req.name}: output cut off at max_tokens`);
  }
  const text = response.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error(`${req.name}: no text block in the response`);
  return dropNulls(JSON.parse(text)) as T;
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
