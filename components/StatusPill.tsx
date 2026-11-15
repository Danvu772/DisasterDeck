"use client";
// The queue health pill in the header. Green dot only when the Brain is running and nothing is stuck.
// Everything else is red, because a person has to restart the Brain or look at the queue.
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
  if (!live) return { bad: true, parts: [{ text: "Desk offline" }] };
  const pending = h.pending ?? 0;
  const oldest = h.oldestPendingSeconds ?? 0;
  const failed = h.failed ?? 0;
  const known = h.lastLoopAt !== undefined;
  const brainUp = h.lastLoopAt != null && (now - new Date(h.lastLoopAt).getTime()) / 1000 < BRAIN_UP_SECONDS;
  const parts: { text: string; mono?: boolean }[] = [];
  if (known && !brainUp) parts.push({ text: "Brain stopped" });
  else if (pending === 0) parts.push({ text: "Live" });
  if (pending > 0) {
    if (parts.length) parts.push({ text: " · " });
    parts.push({ text: String(pending), mono: true }, { text: " queued, oldest " }, { text: wait(oldest), mono: true });
  }
  if (failed > 0) parts.push({ text: " · " }, { text: String(failed), mono: true }, { text: " failed" });
  return { bad: (known && !brainUp) || oldest > BRAIN_UP_SECONDS || failed > 0, parts };
}

const pillBase = "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium";

// Presentational. Below sm only the dot shows, the words stay for screen readers.
export function HealthPill({ health, live = true, now }: { health: HealthInput; live?: boolean; now: number }) {
  const { bad, parts } = healthPill(health, live, now);
  return (
    <span role="status"
      className={`${pillBase} ${bad ? "border-destructive/30 bg-destructive/10 text-destructive" : "bg-background text-foreground"}`}>
      <span aria-hidden="true" className="relative flex size-2 shrink-0">
        {!bad && <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-60 motion-reduce:hidden" />}
        <span className={`relative size-2 rounded-full ${bad ? "bg-destructive" : "bg-success"}`} />
      </span>
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
      <span className={`${pillBase} text-muted-foreground`}>
        <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-border" />
        <span className="sr-only sm:not-sr-only">Connecting</span>
      </span>
    );
  }
  return <HealthPill health={data} live={live} now={now} />;
}
