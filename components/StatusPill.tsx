"use client";
// The queue health pill in the header, v2's composition on USWDS tokens.
// Green (ok) only when the Brain is running and nothing is stuck. Everything else is act red,
// because a person has to go restart the Brain or look at the queue.
import { usePolled } from "./map/usePolled";

export type HealthInput = {
  pending?: number;
  oldestPendingSeconds?: number;
  failed?: number;
  lastLoopAt?: Date | string | null; // undefined = not reported (fixtures), null = the Brain never ran
};

const BRAIN_UP_SECONDS = 30;

// "47 s", "93 min", "5 h"
function wait(seconds: number): string {
  if (seconds < 120) return `${seconds} s`;
  const m = Math.round(seconds / 60);
  return m < 120 ? `${m} min` : `${Math.round(m / 60)} h`;
}

// Pure: health response → what the pill says. Mono parts are the counts and times.
export function healthPill(h: HealthInput, live: boolean, now: number) {
  if (!live) return { bad: true, parts: [{ text: "The desk is not answering" }] };
  const pending = h.pending ?? 0;
  const oldest = h.oldestPendingSeconds ?? 0;
  const failed = h.failed ?? 0;
  const known = h.lastLoopAt !== undefined;
  const brainUp = h.lastLoopAt != null && (now - new Date(h.lastLoopAt).getTime()) / 1000 < BRAIN_UP_SECONDS;
  const parts: { text: string; mono?: boolean }[] = [
    { text: known ? `${brainUp ? "Brain running" : "Brain not running"}, queue ` : "Queue " },
    { text: String(pending), mono: true },
  ];
  if (pending > 0) parts.push({ text: ", oldest " }, { text: wait(oldest), mono: true });
  if (failed > 0) parts.push({ text: ", " }, { text: String(failed), mono: true }, { text: " failed" });
  return { bad: (known && !brainUp) || oldest > BRAIN_UP_SECONDS || failed > 0, parts };
}

// Presentational. Below sm only the dot shows, the words stay for screen readers.
export function HealthPill({ health, live = true, now }: { health: HealthInput; live?: boolean; now: number }) {
  const { bad, parts } = healthPill(health, live, now);
  return (
    <span role="status"
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill px-2.5 py-1 text-xs font-bold text-night-ink ${bad ? "bg-act" : "bg-ok"}`}>
      <span aria-hidden="true" className={`inline-block h-2 w-2 shrink-0 rounded-pill ${bad ? "bg-night-ink" : "bg-ok-soft"}`} />
      <span className="sr-only sm:not-sr-only">
        {parts.map((p, i) => p.mono ? <span key={i} className="font-mono">{p.text}</span> : p.text)}
      </span>
    </span>
  );
}

// Polls GET /api/health every 5 s. No fixture: if the desk does not answer, the pill says so.
// Before the first answer it is a neutral outline, so a page load never flashes red.
export function StatusPill() {
  const { data, live, now, checked } = usePolled<HealthInput>("/api/health", {}, 5000);
  if (!checked) {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border border-night-muted px-2.5 py-1 text-xs text-night-muted">
        <span aria-hidden="true" className="inline-block h-2 w-2 shrink-0 rounded-pill bg-night-muted" />
        <span className="sr-only sm:not-sr-only">Checking the desk</span>
      </span>
    );
  }
  return <HealthPill health={data} live={live} now={now} />;
}
