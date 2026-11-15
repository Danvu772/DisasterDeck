"use client";
// The metric cards under one chat answer. While `active` (the newest answer) a renderless poller
// recomputes them every board poll and the charts tween what changed. When a newer answer arrives
// the poller unmounts and the same cards keep their last values: no fetch, no motion in history.
import { useEffect, useState } from "react";
import type { Event } from "@/lib/types";
import { MetricCard } from "./charts/MetricCard";
import type { MetricId, MetricResult } from "./types";
import { useMetrics } from "./useMetrics";

// `at` is the real time of the board poll the results came from (the /agent space shows its age).
export interface Shown { results: MetricResult[]; live: boolean; at: number }

export function Poller({ ids, events, user, onResults }: {
  ids: MetricId[]; events?: Event[]; user?: string; onResults: (s: Shown) => void;
}) {
  const { results, live, checked, at } = useMetrics(ids, { events, user });
  useEffect(() => { if (checked) onResults({ results, live, at }); }, [checked, results, live, at, onResults]);
  return null;
}

export function ChatMetrics({ ids, active, events, user }: {
  ids: MetricId[]; active: boolean; events?: Event[]; user?: string;
}) {
  const [shown, setShown] = useState<Shown | null>(null);
  if (!ids.length) return null;
  return (
    <div className="flex w-full flex-col gap-3 font-sans">
      {active && <Poller ids={ids} events={events} user={user} onResults={setShown} />}
      {shown && !shown.live && <p className="text-xs text-muted">Demo data, the board API is not answering.</p>}
      {shown?.results.map((r) => <MetricCard key={r.id} result={r} />)}
    </div>
  );
}
