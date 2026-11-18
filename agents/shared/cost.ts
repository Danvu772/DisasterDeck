// Spend meter and hard budget for every model call the agents make.
// Every call is priced and appended to a ledger file (agents/.usage/usage.jsonl, git-ignored;
// AGENT_USAGE_FILE to move it). Before every call the ledger is re-read, so the Next server and the
// workers, which are separate processes, see each other's spend. When the total reaches
// AGENT_BUDGET_USD (default 15), further calls throw BudgetError.
//
// This is a soft guard on one machine. The hard stop is a credit limit on the OpenRouter key.
//
// Price of a call: OpenRouter reports what it charged in usage.cost (USD credits) on every
// response; that is what we record. Only when it is missing do we price the tokens from the table
// below: OpenRouter's headline prices, USD per 1M tokens, read 17 Nov 2026 from
// openrouter.ai/openai/gpt-oss-120b and openrouter.ai/openai/gpt-oss-20b. Headline prices are the
// cheapest provider's; US in-region providers can cost more, which usage.cost captures.

import { appendFileSync, existsSync, mkdirSync, openSync, readSync, closeSync, statSync } from "node:fs";
import path from "node:path";

const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "openai/gpt-oss-120b": { input: 0.03, output: 0.15, cacheRead: 0.015 },
  "openai/gpt-oss-20b": { input: 0.018, output: 0.09, cacheRead: 0.009 },
};
const MOST_EXPENSIVE = { input: 10, output: 50, cacheRead: 1 }; // unknown model: price high, never low

const FILE = process.env.AGENT_USAGE_FILE ?? path.join(process.cwd(), "agents", ".usage", "usage.jsonl");

export class BudgetError extends Error {}

export const BUDGET_USD = (() => {
  const raw = process.env.AGENT_BUDGET_USD;
  const v = Number(raw);
  if (raw !== undefined && !(Number.isFinite(v) && v > 0)) {
    console.warn(`[cost] AGENT_BUDGET_USD="${raw}" is not a positive number; using 15`);
  }
  return Number.isFinite(v) && v > 0 ? v : 15;
})();

// The ledger only grows, so read just the new bytes each time.
let readBytes = 0;
let ledgerTotal = 0;
let unwritten = 0; // spend this process could not append (read-only disk)

function ledger(): number {
  try {
    if (!existsSync(FILE)) return ledgerTotal + unwritten;
    const size = statSync(FILE).size;
    if (size < readBytes) { readBytes = 0; ledgerTotal = 0; } // file was reset
    if (size > readBytes) {
      const fd = openSync(FILE, "r");
      const buf = Buffer.alloc(size - readBytes);
      readSync(fd, buf, 0, buf.length, readBytes);
      closeSync(fd);
      const text = buf.toString("utf8");
      const lastNl = text.lastIndexOf("\n");
      if (lastNl >= 0) { // only whole lines; a line still being written is read next time
        for (const line of text.slice(0, lastNl).split("\n")) {
          if (!line.trim()) continue;
          try { ledgerTotal += Number(JSON.parse(line).usd) || 0; } catch { /* skip a torn line */ }
        }
        readBytes += Buffer.byteLength(text.slice(0, lastNl + 1));
      }
    }
  } catch { /* unreadable ledger: fall back to what this process knows */ }
  return ledgerTotal + unwritten;
}

export function spentUsd(): number {
  return ledger();
}

/** Call before every request. Throws once the budget is used up. */
export function assertBudget(label: string): void {
  const t = ledger();
  if (t >= BUDGET_USD) {
    throw new BudgetError(
      `${label}: agent budget used up ($${t.toFixed(2)} of $${BUDGET_USD}). Raise AGENT_BUDGET_USD to continue.`,
    );
  }
}

/** The usage block of an OpenRouter chat completions response (the fields we price). */
export interface UsageLike {
  prompt_tokens: number;
  completion_tokens: number;
  prompt_tokens_details?: { cached_tokens?: number | null } | null;
  /** What OpenRouter charged for the call, in USD credits. */
  cost?: number | null;
}

/** The charged cost when OpenRouter reports it, else the tokens priced from the table. */
export function priceUsd(model: string, u: UsageLike): number {
  if (typeof u.cost === "number" && Number.isFinite(u.cost) && u.cost >= 0) return u.cost;
  const p = PRICES[model] ?? MOST_EXPENSIVE;
  const m = 1 / 1_000_000;
  const cached = Math.min(u.prompt_tokens ?? 0, u.prompt_tokens_details?.cached_tokens ?? 0);
  return ((u.prompt_tokens ?? 0) - cached) * p.input * m + cached * p.cacheRead * m + (u.completion_tokens ?? 0) * p.output * m;
}

/** Record one response. `requested` is the model asked for; `served` the one that answered. */
export function recordUsage(label: string, requested: string, u: UsageLike, served = requested): number {
  const usd = priceUsd(requested, u);
  const row = JSON.stringify({
    ts: new Date().toISOString(), label, model: served,
    in: u.prompt_tokens ?? 0, out: u.completion_tokens ?? 0, cacheR: u.prompt_tokens_details?.cached_tokens ?? 0,
    priced: typeof u.cost === "number" ? "openrouter" : "table",
    usd: Number(usd.toFixed(6)),
  }) + "\n";
  try {
    mkdirSync(path.dirname(FILE), { recursive: true });
    appendFileSync(FILE, row);
  } catch {
    unwritten += usd; // a read-only disk must not break the desk; this process still counts it
  }
  return usd;
}

/**
 * A response that came without a usage block (a provider or stream that left it out, an error body,
 * a stream that broke). Never record $0 for it: assume the worst for this call, the whole request
 * as prompt tokens (characters are an upper bound on tokens) and max_tokens of output, at the
 * model's own table rates, or the most expensive rates for a model not in the table. Says so.
 */
export function recordMissingUsage(label: string, model: string, maxTokens: number, promptChars: number, served = model): number {
  const p = PRICES[model] ?? MOST_EXPENSIVE;
  const usd = (promptChars * p.input + maxTokens * p.output) / 1_000_000;
  console.warn(`[cost] ${label}: no usage in the response from ${served}; recording a pessimistic $${usd.toFixed(6)} ` +
    `(${promptChars} prompt chars at $${p.input}/M, ${maxTokens} output tokens at $${p.output}/M${PRICES[model] ? "" : ", unknown model: top rates"})`);
  const row = JSON.stringify({ ts: new Date().toISOString(), label, model: served, in: 0, out: 0, cacheR: 0,
    priced: "estimate", usd: Number(usd.toFixed(6)) }) + "\n";
  try {
    mkdirSync(path.dirname(FILE), { recursive: true });
    appendFileSync(FILE, row);
  } catch {
    unwritten += usd;
  }
  return usd;
}
