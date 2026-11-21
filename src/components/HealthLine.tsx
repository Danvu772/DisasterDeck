// The header's health pill, for screens that already hold the board's health.
// Without lastLoopAt (fixtures) it says nothing about the Brain and goes red when the oldest job is over 30 s.
import { HealthPill } from "./StatusPill";

export function HealthLine({ pending, oldestPendingSeconds, failed = 0, lastLoopAt, now }: {
  pending: number; oldestPendingSeconds: number; failed?: number; lastLoopAt?: Date | string | null; now?: number;
}) {
  return <HealthPill health={{ pending, oldestPendingSeconds, failed, lastLoopAt }} now={now ?? Date.now()} />;
}
