"use client";
// The /agent chart space (t42). Opens on every prompt: beside the chat from lg up (it pushes the chat
// narrower), a bottom sheet over the lower half below that. Charts and their labels only. The reply
// text and errors stay in the chat box. Only the newest charted prompt polls the board. Older ones
// keep the values they had when a newer one replaced them, and say when that was.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { Event } from "@/lib/types";
import { MetricCard } from "../metrics/charts/MetricCard";
import { Poller, type Shown } from "../metrics/ChatMetrics";
import type { MetricId } from "../metrics/types";
import { button, chip, pill } from "../encode";
import "./viz.css";

// One prompt. `ids` is null while the agent thinks, [] when there is nothing to chart.
export interface Ask { id: string; question: string; at: number; ids: MetricId[] | null }

const STAGGER_MS = 120;
const EMPTY_CLOSE_MS = 2000;

const NAME: Record<MetricId, string> = {
  sla_t0: "Approvals",
  freshness: "Freshness",
  credibility: "Credibility",
  shelters: "Shelters",
  logistics: "Deliveries",
  coverage: "Coverage",
  ics209: "Status report",
  lifelines: "Roads",
  agent_fidelity: "Agent accuracy",
  triage_order: "Triage order",
};

export function hhmm(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// "Shelters, 01:42" or "Shelters and roads, 01:44".
export function askLabel(a: Ask): string {
  const names = (a.ids ?? []).map((id, i) => (i === 0 ? NAME[id] : NAME[id].toLowerCase()));
  return `${names.join(" and ")}, ${hhmm(a.at)}`;
}

export type View =
  | { kind: "thinking"; question: string }
  | { kind: "empty" }
  | { kind: "charts"; ask: Ask; live: boolean };

// Pure: what the space draws. A picked history row wins, else the newest prompt's state.
export function viewOf(asks: Ask[], pick: string | null): View | null {
  const charted = asks.filter((a) => a.ids?.length);
  const newest = charted.at(-1);
  const picked = pick ? charted.find((a) => a.id === pick) : undefined;
  if (picked) return { kind: "charts", ask: picked, live: picked === newest };
  const last = asks.at(-1);
  if (!last) return null;
  if (!last.ids) return { kind: "thinking", question: last.question };
  if (!last.ids.length) return { kind: "empty" };
  return { kind: "charts", ask: last, live: true };
}

function Thinking({ question }: { question: string }) {
  return (
    <>
      <p className="truncate text-sm" title={question}>{question}</p>
      <p role="status" className="text-sm text-muted">Reading the desk</p>
      <div aria-hidden className="rounded-card border border-line p-4">
        <div className="viz-shimmer h-4 w-1/2 bg-line" />
        <div className="viz-shimmer mt-4 h-3 w-full bg-line" style={{ animationDelay: `${STAGGER_MS}ms` }} />
        <div className="viz-shimmer mt-2 h-3 w-3/4 bg-line" style={{ animationDelay: `${2 * STAGGER_MS}ms` }} />
        <div className="viz-shimmer mt-2 h-3 w-1/3 bg-line" style={{ animationDelay: `${3 * STAGGER_MS}ms` }} />
      </div>
    </>
  );
}

export function VizSpace({ asks, open, onClose, events, user }: {
  asks: Ask[]; open: boolean; onClose: () => void; events?: Event[]; user?: string;
}) {
  const [pick, setPick] = useState<string | null>(null);
  const [snaps, setSnaps] = useState<Record<string, Shown>>({});
  const [tick, setTick] = useState(() => Date.now());
  // A new prompt drops the history pick, so the space follows the newest question.
  const [count, setCount] = useState(asks.length);
  if (asks.length !== count) {
    setCount(asks.length);
    setPick(null);
  }

  const charted = asks.filter((a) => a.ids?.length);
  const liveAsk = charted.at(-1);
  const liveId = liveAsk?.id;
  const view = viewOf(asks, pick);
  const snap = view?.kind === "charts" ? snaps[view.ask.id] : undefined;
  const showLive = open && view?.kind === "charts" && view.live;
  const empty = open && view?.kind === "empty";

  const onResults = useCallback((s: Shown) => {
    if (liveId) setSnaps((x) => ({ ...x, [liveId]: s }));
  }, [liveId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!empty) return;
    const t = setTimeout(onClose, EMPTY_CLOSE_MS);
    return () => clearTimeout(t);
  }, [empty, onClose]);

  // The Live tag's age, once a second, only while it is on screen.
  useEffect(() => {
    if (!showLive) return;
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [showLive]);

  let body: ReactNode = null;
  if (view?.kind === "thinking") body = <Thinking question={view.question} />;
  else if (view?.kind === "empty") body = <p role="status" className="text-sm text-muted">Nothing to chart for this question</p>;
  else if (view?.kind === "charts" && !snap) {
    body = view.live
      ? <Thinking question={view.ask.question} />
      : <p className="text-sm text-muted">These charts closed before the board answered, so no values were kept.</p>;
  } else if (view?.kind === "charts" && snap) {
    body = (
      <>
        <p className="text-sm text-muted">
          {!view.live ? `As of ${hhmm(snap.at)}`
            : snap.live ? <span className={pill}>Live, board <span className="font-mono">{Math.max(0, Math.round((tick - snap.at) / 1000))}</span> s old</span>
              : "Demo data, the board API is not answering."}
        </p>
        {snap.results.map((r, i) => (
          <div key={`${view.ask.id}:${r.id}`} className="viz-in" style={{ animationDelay: `${i * STAGGER_MS}ms` }}>
            <MetricCard result={r} />
          </div>
        ))}
      </>
    );
  }

  const shownId = view?.kind === "charts" ? view.ask.id : null;
  return (
    <aside aria-label="Charts" className={`fixed inset-x-0 bottom-0 z-[1100] h-[50vh] border-t border-line bg-card
      transition-[translate,visibility] duration-250 ease-out motion-reduce:transition-none
      lg:relative lg:inset-auto lg:z-auto lg:h-auto lg:shrink-0 lg:translate-y-0 lg:border-t-0 lg:bg-transparent
      lg:transition-[width,visibility] ${open ? "visible translate-y-0 lg:w-[22rem] xl:w-[26rem]" : "invisible translate-y-full lg:w-0"}`}>
      {open && liveAsk?.ids && <Poller key={liveAsk.id} ids={liveAsk.ids} events={events} user={user} onResults={onResults} />}
      {/* Pinned to the right edge at full width, so widening the aside slides it in from the right. */}
      <div className="h-full lg:absolute lg:inset-y-0 lg:right-0 lg:w-[22rem] lg:pl-4 xl:w-[26rem]">
        <div className="flex h-full flex-col gap-3 overflow-y-auto bg-card p-4 lg:rounded-card lg:border lg:border-line">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold">Charts</h2>
            <button type="button" className={button.outline} onClick={onClose}>Close</button>
          </div>
          {charted.length > 0 && (
            <div role="group" aria-label="Earlier charts" className="flex shrink-0 gap-2 overflow-x-auto pb-1">
              {charted.map((a) => (
                <button key={a.id} type="button" aria-pressed={a.id === shownId} className={chip(a.id === shownId)}
                  onClick={() => setPick(a.id)}>
                  {askLabel(a)}
                </button>
              ))}
            </div>
          )}
          {body}
        </div>
      </div>
    </aside>
  );
}
