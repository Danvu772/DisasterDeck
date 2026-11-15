// Spend meter and hard budget for every Claude call the agents make.
// The team has about $20 of API credit. Every call is priced from its `usage` block and
// appended to a ledger file (agents/.usage/usage.jsonl, git-ignored; AGENT_USAGE_FILE to move it).
// Before every call the ledger is re-read, so the Next server and the workers, which are
// separate processes, see each other's spend. When the total reaches AGENT_BUDGET_USD
// (default 15), further calls throw BudgetError.
//
// This is a soft guard on one machine. The hard stop is a spend limit on the API key's
// workspace in the Anthropic Console (set it to about $18).
//
// Prices: Anthropic first-party list prices, USD per 1M tokens (Nov 2026). Cache writes are
// 1.25× input (5-minute TTL). Web search is billed per search.

import { appendFileSync, existsSync, mkdirSync, openSync, readSync, closeSync, statSync } from "node:fs";
import path from "node:path";

const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-fable-5-2": { input: 8, output: 40, cacheRead: 0.2 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};
const MOST_EXPENSIVE = { input: 10, output: 50, cacheRead: 1 }; // unknown model: price high, never low
const WEB_SEARCH_USD = 0.01;

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

interface TokenCounts {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}
/** The fields of BetaUsage we price. */
export interface UsageLike extends TokenCounts {
  server_tool_use?: { web_search_requests?: number | null } | null;
  iterations?: ReadonlyArray<TokenCounts & { type: string; model?: string | null }> | null;
}

function tokensUsd(model: string, u: TokenCounts): number {
  const p = PRICES[model] ?? MOST_EXPENSIVE;
  const m = 1 / 1_000_000;
  return u.input_tokens * p.input * m +
    (u.cache_creation_input_tokens ?? 0) * p.input * 1.25 * m +
    (u.cache_read_input_tokens ?? 0) * p.cacheRead * m +
    u.output_tokens * p.output * m;
}

/**
 * With refusal fallbacks, top-level usage covers only the attempt that produced the answer;
 * a declined attempt is billed too and appears only in usage.iterations. Price every attempt.
 */
export function priceUsd(model: string, u: UsageLike): number {
  const attempts = (u.iterations ?? []).filter((it) => it.type === "message" || it.type === "fallback_message");
  const tokens = attempts.length
    ? attempts.reduce((sum, it) => sum + tokensUsd(it.model ?? model, it), 0)
    : tokensUsd(model, u);
  return tokens + (u.server_tool_use?.web_search_requests ?? 0) * WEB_SEARCH_USD;
}

/** Record one response. `requested` is the model asked for; `served` the one that answered. */
export function recordUsage(label: string, requested: string, u: UsageLike, served = requested): number {
  const usd = priceUsd(requested, u);
  const row = JSON.stringify({
    ts: new Date().toISOString(), label, model: served,
    in: u.input_tokens, out: u.output_tokens,
    cacheW: u.cache_creation_input_tokens ?? 0, cacheR: u.cache_read_input_tokens ?? 0,
    search: u.server_tool_use?.web_search_requests ?? 0,
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
