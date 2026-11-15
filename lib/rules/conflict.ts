// Owned by Role 1. "When two sources disagree" (Final system design §5). Pure: the keeper
// loads the stored value and who said it, this decides which one stays.
//   - the higher trust wins
//   - the same trust: the newer observedAt wins (a tie keeps what is stored)
//   - the loser is never thrown away: the keeper writes it into the history
//   - two trusted (official or vetted) sources that disagree within 10 minutes: ask to confirm
import type { Source, Trust } from "../types";

export const CONFIRM_WITHIN_MS = 10 * 60_000;
const RANK: Record<Trust, number> = { public: 0, vetted: 1, official: 2 };

export interface Stamp { trust: Trust; observedAt: Date; source?: Source; who?: string }

export const trustRank = (t: Trust) => RANK[t];
export const isTrustedLevel = (t: Trust) => t !== "public";

export function resolveConflict(stored: Stamp, incoming: Stamp): { winner: "stored" | "incoming"; why: string } {
  if (RANK[incoming.trust] !== RANK[stored.trust]) {
    return RANK[incoming.trust] > RANK[stored.trust]
      ? { winner: "incoming", why: "higher trust" } : { winner: "stored", why: "lower trust" };
  }
  return incoming.observedAt.getTime() > stored.observedAt.getTime()
    ? { winner: "incoming", why: "same trust, newer" } : { winner: "stored", why: "same trust, not newer" };
}

/** Two trusted sources, different values, observed within 10 minutes of each other. */
export function trustedClash(a: Stamp, b: Stamp, windowMs = CONFIRM_WITHIN_MS): boolean {
  return isTrustedLevel(a.trust) && isTrustedLevel(b.trust)
    && Math.abs(a.observedAt.getTime() - b.observedAt.getTime()) <= windowMs;
}

const from = (s: Stamp) => `${s.who ?? s.source ?? "unknown"} (${s.trust})`;

/** The line for the history: what stayed and what was ignored, or what replaced what. */
export function conflictNote(
  verdict: ReturnType<typeof resolveConflict>, stored: Stamp, storedValue: string, incoming: Stamp, incomingValue: string,
): string {
  return verdict.winner === "stored"
    ? `kept ${storedValue} from ${from(stored)}, ignored ${incomingValue} from ${from(incoming)} (${verdict.why})`
    : `took ${incomingValue} from ${from(incoming)} over ${storedValue} from ${from(stored)} (${verdict.why})`;
}
