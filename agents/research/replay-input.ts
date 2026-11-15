import { readFileSync } from "node:fs";
import type { ReplayTweet } from "./x-extract";

export function isHistoricalTweet(tweet: ReplayTweet): boolean {
  return tweet.provenance?.kind === "historical-real-tweet";
}

export function readReplay(file: string): ReplayTweet[] {
  const data: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(data) || !data.length) throw new Error("Replay must be a nonempty JSON array");
  const seen = new Set<string>();
  for (const row of data as ReplayTweet[]) {
    if (!row || typeof row.id !== "string" || !row.id || seen.has(row.id) || typeof row.text !== "string" || !row.text.trim() ||
      !Number.isFinite(row.ts_offset_seconds) || row.ts_offset_seconds < 0) throw new Error("Invalid replay row or duplicate ID");
    seen.add(row.id);
    if (row.observedAt && !Number.isFinite(Date.parse(row.observedAt))) throw new Error(`Invalid observedAt for ${row.id}`);
    if (isHistoricalTweet(row)) {
      if (!/^\d{17,20}$/.test(row.id) || !row.observedAt || row.provenance?.synthetic !== false) throw new Error("Historical replay needs an original string tweet ID, timestamp and explicit provenance");
      const timestamp = Number((BigInt(row.id) >> BigInt(22)) + BigInt("1288834974657"));
      if (Math.abs(timestamp - Date.parse(row.observedAt)) >= 2000) throw new Error(`Tweet ID and archive timestamp disagree: ${row.id}`);
      if (Date.parse(row.observedAt) > Date.now()) throw new Error("A historical tweet cannot have a future timestamp");
    }
  }
  return (data as ReplayTweet[]).sort((a,b) => a.ts_offset_seconds-b.ts_offset_seconds);
}

export function replayObservation(tweet: ReplayTweet, now = new Date()): string {
  return tweet.observedAt ?? now.toISOString();
}

export function replayKey(tweet: ReplayTweet, deskId: string): string {
  // Preserve legacy synthetic keys. Real archive records are scoped to their replay desk.
  return isHistoricalTweet(tweet) ? `x:${deskId}:${tweet.id}` : `x:${tweet.id}`;
}
