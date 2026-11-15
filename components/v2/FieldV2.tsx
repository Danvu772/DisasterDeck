"use client";
// v2 field team phone: one task, big buttons, a red Problem button, and hold to talk.
// Events go through the field outbox, so a dropped network queues them instead of losing them.
import { useState } from "react";
import { openTasksFor } from "../field/pickTask";
import { useHoldToTalk } from "../field/useHoldToTalk";
import { useOutbox } from "../field/useOutbox";
import { useDesk } from "./useDesk";
import { problemChoices, type ProblemKind } from "../taskEvents";
import { nameOf, type V2Board } from "./boardModel";
import { TierBadge } from "./ui";

const ETAS = [10, 20, 30, 45];

export function FieldV2({ initial, userId }: { initial: V2Board; userId: string }) {
  const { data: b, live, demo } = useDesk<V2Board>("/api/board", initial);
  const mine = openTasksFor(b, userId);
  const cur = mine[0];
  const blankets = b.needs.find((n) => n.requestedBy.includes(userId) && n.status !== "delivered" && n.status !== "cancelled");

  const { send, waiting } = useOutbox(userId);
  const talk = useHoldToTalk(userId);
  const [arrived, setArrived] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"eta" | "problem" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const step = !cur ? -1 : cur.task.status === "assigned" ? 0 : arrived === cur.task._id ? 2 : 1;

  async function post(e: Parameters<typeof send>[0], done: string) {
    setBusy(true);
    const r = await send(e);
    setBusy(false);
    setSheet(null);
    setNote(r.ok ? (r.queued ? `${done} Saved on the phone, it goes out when the network is back.` : done) : `Not sent: ${r.error}`);
    return r.ok;
  }

  async function problem(kind: ProblemKind) {
    if (!cur) return;
    const c = problemChoices.find((p) => p.kind === kind)!;
    await post({ type: "incident", payload: { kind: c.kind, text: c.text, textEn: c.textEn, taskId: cur.task._id, canContinue: false } },
      "Problem filed. The desk protects your task and tells everyone waiting.");
  }

  const agentLine = talk.state === "recording" ? "Listening. Let go to send."
    : talk.state === "sending" ? "Sending what you said."
    : talk.reply ?? talk.error ?? note
      ?? (cur ? `Your task: ${cur.place}. ${cur.people}.` : "No task right now. Hold the button and tell the desk what you see.");

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[430px] flex-col" style={{ background: "var(--v2-bg)" }}>
      <header className="topbar flex items-center gap-2.5 px-[18px] pb-3.5 pt-[18px]">
        <div className="flex-1">
          <div className="text-lg font-bold">{nameOf(userId)}</div>
          <div className="text-xs" style={{ color: "var(--v2-night-muted)" }}>Malatya exercise, official field team</div>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${live || demo ? "health-ok" : "health-bad"}`}>
          <span className={`inline-block h-2 w-2 rounded-full ${live || demo ? "dot-ok" : "dot-bad"}`} aria-hidden="true" />
          {demo ? "Demo desk" : live ? "Online" : "Offline"}{waiting ? `, ${waiting} waiting to send` : ""}
        </span>
      </header>

      <main className="flex flex-1 flex-col gap-3 overflow-y-auto p-3.5">
        {!cur && <div className="card p-5 text-base">Nothing assigned to you right now.</div>}
        {cur && (
          <article className="card-strong flex flex-col gap-3 p-[18px]">
            <div className="flex items-center gap-2">
              <TierBadge tier={cur.task.tier} />
              <span className="eyebrow">{cur.task.type}, <span className="mono normal-case">{cur.caseId}</span></span>
            </div>
            <div>
              <div className="text-[26px] font-extrabold leading-tight tracking-tight">{cur.place}</div>
              <div className="mt-0.5 text-base" style={{ color: "var(--v2-ink-2)" }}>{cur.people}</div>
            </div>
            <p className="text-sm muted">{cur.task.detail}</p>

            {step === 0 && <button disabled={busy} onClick={() => setSheet("eta")} className="btn btn-lg btn-dark" style={{ minHeight: 60, fontSize: 19 }}>On our way</button>}
            {step === 1 && (
              <button disabled={busy} className="btn btn-lg btn-blue" style={{ minHeight: 60, fontSize: 19 }}
                onClick={async () => {
                  if (await post({ type: "answer", payload: { taskId: cur.task._id, result: "accepted", etaMinutes: 0, note: "Arrived" } }, "Filed: on site.")) setArrived(cur.task._id);
                }}>We arrived</button>
            )}
            {step === 2 && (
              <button disabled={busy} className="btn btn-lg btn-dark" style={{ minHeight: 60, fontSize: 19 }}
                onClick={() => post({ type: "answer", payload: { taskId: cur.task._id, result: "done", note: "Done" } }, "Filed: done. Thank you.")}>Done here</button>
            )}
            <button disabled={busy} onClick={() => setSheet("problem")} className="btn btn-lg btn-danger" style={{ minHeight: 52 }}>Problem</button>
          </article>
        )}

        <div className="agent-note flex gap-2.5 px-3.5 py-3 text-[15px] leading-snug" role="status">
          <span className="font-bold">Your agent:</span> <span>{agentLine}</span>
        </div>

        {blankets && (
          <div className="card flex items-center gap-2.5 px-3.5 py-3">
            <TierBadge tier={blankets.tier} />
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold">{blankets.quantity} {blankets.item} for you</div>
              <div className="text-[13px] muted">{blankets.status.replace(/_/g, " ")}</div>
            </div>
          </div>
        )}

        {mine.slice(1, 3).map((t) => (
          <div key={t.task._id} className="card flex items-center gap-2.5 px-3.5 py-3">
            <TierBadge tier={t.task.tier} />
            <div className="min-w-0 flex-1"><div className="truncate text-[15px] font-semibold">{t.place}</div><div className="text-[13px] muted">next</div></div>
          </div>
        ))}
      </main>

      <footer className="flex flex-col gap-2 border-t px-3.5 pb-6 pt-3" style={{ background: "var(--v2-card)", borderColor: "var(--v2-line-2)" }}>
        <button
          disabled={talk.state === "unsupported" || talk.state === "sending"}
          onPointerDown={(e) => { e.preventDefault(); talk.start(); }}
          onPointerUp={() => talk.stop()} onPointerLeave={() => talk.state === "recording" && talk.stop()}
          className="btn btn-brand flex items-center justify-center gap-2.5 rounded-full select-none"
          style={{ minHeight: 72, fontSize: 19, fontWeight: 800, touchAction: "none" }}
          aria-label="Hold to talk to your agent">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8.5" y="3" width="7" height="12" rx="3.5" stroke="currentColor" strokeWidth="2" /><path d="M5 11.5a7 7 0 0014 0M12 18.5v2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          {talk.state === "recording" ? "Listening, let go to send" : talk.state === "unsupported" ? "Talking needs HTTPS and Chrome" : "Hold to talk"}
        </button>
        <p className="text-center text-xs muted">Say it once: 20 blankets, one more person has hypothermia. The agent files each part.</p>
      </footer>

      {sheet && cur && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" style={{ background: "rgba(11,18,32,.55)" }} onClick={() => setSheet(null)}>
          <div role="dialog" aria-label={sheet === "eta" ? "How long until you arrive" : "What went wrong"}
            className="mx-auto flex w-full max-w-[430px] flex-col gap-2.5 rounded-t-[22px] px-4 pb-7 pt-5" style={{ background: "var(--v2-card)" }}
            onClick={(e) => e.stopPropagation()}>
            <div className="text-xl font-extrabold">{sheet === "eta" ? "When will you be there?" : "What went wrong?"}</div>
            <div className="text-sm muted">{sheet === "eta" ? "The coordinator and the people waiting see this." : "The desk protects your task and tells everyone waiting."}</div>
            {sheet === "eta" && ETAS.map((m) => (
              <button key={m} disabled={busy} className="btn btn-lg btn-ghost text-left" style={{ minHeight: 56 }}
                onClick={() => post({ type: "answer", payload: { taskId: cur.task._id, result: "accepted", etaMinutes: m } }, `Filed: on your way, about ${m} min.`)}>
                About {m} minutes
              </button>
            ))}
            {sheet === "problem" && problemChoices.map((p) => (
              <button key={p.kind} disabled={busy} className="btn btn-lg btn-ghost text-left" style={{ minHeight: 56 }} onClick={() => problem(p.kind)}>
                {p.label}
              </button>
            ))}
            <button onClick={() => setSheet(null)} className="btn" style={{ background: "var(--v2-calm-soft)", minHeight: 48 }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
