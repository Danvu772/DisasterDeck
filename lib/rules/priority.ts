// Owned by Role 1. Tier, score and confidence (Final system design §5). Plain code, no LLM:
// the same inputs always give the same order, and anyone can read why.
import type { Confidence, Tier, Trust } from "../types";

export interface ScoreInput {
  support: number;          // different people or sources asking (copies do not count)
  waitingSince: Date;       // when the fact was first true
  silentZone?: boolean;     // NASA silent zone (+30)
  warmthInCold?: boolean;   // a warmth need where the night is below 0 °C (+20)
}

/**
 * score = 10 × support (at most 50) + 1 × minutes waiting (at most 60)
 *       + 30 in a silent zone + 20 for a warmth need in the cold.
 * Satellite terms are only ever added, never subtracted.
 */
export function score(s: ScoreInput, now: Date = new Date()): number {
  const minutes = Math.max(0, Math.floor((now.getTime() - s.waitingSince.getTime()) / 60_000));
  return Math.min(50, 10 * s.support) + Math.min(60, minutes)
    + (s.silentZone ? 30 : 0) + (s.warmthInCold ? 20 : 0);
}

/** Tier of a collapse site: 0 when someone is trapped (danger to life), else 1. */
export function siteTier(peopleTrapped: number, kinds: string[]): Tier {
  return peopleTrapped > 0 || kinds.includes("trapped") ? 0 : 1;
}

/** One voice behind a fact: who said it, and how far the desk trusts them. */
export interface Voice { key: string; trust: Trust }

/**
 * confirmed     a trusted person (official or vetted) said it
 * corroborated  3 or more different public voices
 * unconfirmed   anything else
 */
export function confidence(voices: Voice[]): Confidence {
  if (voices.some((v) => v.trust === "official" || v.trust === "vetted")) return "confirmed";
  const publicVoices = new Set(voices.filter((v) => v.trust === "public").map((v) => v.key));
  return publicVoices.size >= 3 ? "corroborated" : "unconfirmed";
}

/** support = how many different voices, never how many copies. */
export function support(voices: Voice[]): number {
  return new Set(voices.map((v) => v.key)).size;
}
