"use client";
// The field team's phone. One task, big buttons, works with one thumb and a bad network.
// Polls GET /api/board, falls back to the demo board and says so.
import { useState } from "react";
import type { IncidentKind, LatLng } from "@/lib/types";
import { usePolled } from "@/components/map/usePolled";
import { History } from "@/components/History";
import { ChatLine } from "@/components/ChatLine";
import { button, confidenceBorder, statusTag, statusText, tierBadge, tierBar, tierText } from "@/components/encode";
import { CaseNo } from "@/components/ScoreBreakdown";
import { openTasksFor, type FieldBoard, type FieldTask } from "./pickTask";
import { useOutbox, type FieldEvent } from "./useOutbox";
import { useHoldToTalk } from "./useHoldToTalk";

type Panel = "eta" | "done" | "problem" | null;

const ETAS = [10, 20, 30, 60];
const PROBLEMS: { kind: IncidentKind; label: string; text: string }[] = [
  { kind: "vehicle_breakdown", label: "Vehicle", text: "Our vehicle broke down, we cannot continue." },
  { kind: "road_blocked", label: "Road blocked", text: "The road is blocked, we cannot get through." },
  { kind: "cannot_find", label: "Can't find it", text: "We cannot find the address." },
  { kind: "other", label: "Other", text: "We have a problem and cannot continue." },
];

// Big versions of the USWDS buttons from encode.ts. The ! wins over the small default size.
const big = (cls: string) => `${cls} block w-full px-4! py-4! text-xl! disabled:opacity-50`;
const quiet = "w-full py-3 text-lg text-primary underline hover:text-primary-dark";

// Where the phone is, if it answers within `ms`. Problems go out without it otherwise.
function position(ms: number): Promise<LatLng | undefined> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(undefined);
    const t = setTimeout(() => resolve(undefined), ms);
    navigator.geolocation.getCurrentPosition(
      (p) => { clearTimeout(t); resolve([p.coords.latitude, p.coords.longitude]); },
      () => { clearTimeout(t); resolve(undefined); },
      { timeout: ms, maximumAge: 60000, enableHighAccuracy: true },
    );
  });
}

function OtherRow({ o, now, onPick }: { o: FieldTask; now: number; onPick: (id: string) => void }) {
  const t = o.task;
  const min = Math.round((new Date(t.deadline).getTime() - now) / 60000);
  const late = min < 0;
  return (
    <button onClick={() => onPick(t._id)}
      className="flex min-h-14 w-full overflow-hidden rounded-card border border-line bg-card text-left hover:border-primary">
      <span className={`w-3 shrink-0 ${tierBar(t.tier, late)}`} />
      <span className="min-w-0 flex-1 p-3">
        <span className="block break-words text-lg font-bold leading-tight">{t.title}</span>
        <span className="block break-words text-base">{o.place}</span>
        <span className={`block text-base ${late ? "font-bold text-act" : "text-muted"}`}>
          {late ? `Overdue by ${-min} min` : `Answer in ${min} min`}
        </span>
      </span>
    </button>
  );
}

export function FieldPhone({ user, wanted, initial, initialLive = false }: {
  user: string; wanted?: string; initial: FieldBoard; initialLive?: boolean;
}) {
  const { data, live, now } = usePolled<FieldBoard>("/api/board", initial, 1000, initialLive);
  const { send, waiting } = useOutbox(user);
  const talk = useHoldToTalk(user);
  const [panel, setPanel] = useState<Panel>(null);
  const [details, setDetails] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  // What this phone already sent, so the next button lights up before the board catches up.
  const [local, setLocal] = useState<{ id: string; step: number } | null>(null);

  // Which task the team chose. Kept in the URL as ?task= so a reload or a link shows the same one.
  const [chosen, setChosen] = useState(wanted);
  const open = openTasksFor(data, user);
  const picked = open.find((o) => o.task._id === chosen);
  const current = picked ?? open[0] ?? null;
  const closed = !!chosen && !picked;
  const others = open.filter((o) => o !== current);
  const task = current?.task;
  const aboutRecord = task && (task.recordType === "site" ? data.sites.find((x) => x._id === task.recordId)
    : task.recordType === "need" ? data.needs.find((x) => x._id === task.recordId) : undefined);
  const caseNo = aboutRecord?.caseNo;
  const step = task
    ? Math.max(task.status === "accepted" ? 1 : 0, local?.id === task._id ? local.step : 0)
    : 0;
  const overdue = !!task && new Date(task.deadline).getTime() < now;
  const minutesLeft = task ? Math.round((new Date(task.deadline).getTime() - now) / 60000) : 0;

  function choose(id: string) {
    setChosen(id);
    setPanel(null);
    setDetails(false);
    setNote("");
    setSaid(null);
    const url = new URL(window.location.href);
    url.searchParams.set("task", id);
    window.history.replaceState(null, "", url);
    window.scrollTo({ top: 0 });
  }

  async function report(e: FieldEvent, what: string, nextStep?: number) {
    setBusy(true);
    const r = await send(e);
    setBusy(false);
    setPanel(null);
    if (r.ok && task && nextStep !== undefined) setLocal({ id: task._id, step: nextStep });
    if (r.ok) setNote("");
    setSaid(!r.ok ? `Not sent. ${r.error}`
      : r.queued ? `${what}. No network, it sends when the phone is back online.`
      : `Sent: ${what}.`);
  }

  async function problem(p: (typeof PROBLEMS)[number]) {
    if (!task) return;
    setBusy(true);
    const coords = await position(3000);
    await report({
      type: "incident",
      payload: { kind: p.kind, text: p.text, textEn: p.text, taskId: task._id, canContinue: false, ...(coords && { coords }) },
    }, `Problem, ${p.label.toLowerCase()}`);
  }

  const primaryIf = (s: number) => big(step === s ? button.primary : button.outline);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <p className="text-sm text-muted">
        {live ? "Live from the desk" : "Demo data, the board API is not answering"}. Acting as {user} (demo).
      </p>

      {waiting > 0 && (
        <p className="rounded-card border-2 border-ink p-3 text-lg font-bold">
          {waiting} {waiting === 1 ? "report" : "reports"} waiting to send. Trying again every 10 seconds.
        </p>
      )}
      {said && <p className="text-lg" role="status">{said}</p>}
      {closed && <p className="text-base text-muted">That task is closed, showing your next one.</p>}

      {!current || !task ? (
        <section className="rounded-card border border-line p-4">
          <h1 className="text-3xl font-bold leading-tight">No task right now</h1>
          <p className="mt-2 text-lg">The desk sends your next task here. Hold to talk if you need something.</p>
        </section>
      ) : (
        <>
          <h1 className="text-2xl font-bold leading-tight">Your next task</h1>
          <section className={`flex flex-col gap-3 rounded-card bg-card p-4 ${confidenceBorder("confirmed")}`}>
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <span className={`rounded-pill px-2 py-0.5 text-xs font-bold ${tierBadge(task.tier, overdue)}`}>
                <span className="font-mono">{tierText(task.tier).code}</span> {tierText(task.tier).word}
              </span>
              <span className="text-muted">{task.type}, case <span className="font-mono">{current.caseId}</span></span>
              {overdue && <span className="font-bold text-act">Overdue</span>}
            </p>
            <div>
              <h2 className="break-words text-3xl font-bold leading-tight">{current.place}</h2>
              <p className="mt-1 text-lg">{current.people}</p>
            </div>
            <p className="break-words text-base text-muted">
              {caseNo !== undefined && <span className="mr-2"><CaseNo kind={task.recordType} no={caseNo} /></span>}
              {task.title}
            </p>
            <button className={`${big(button.outline)} py-2! text-lg!`} aria-expanded={details}
              onClick={() => setDetails(!details)}>
              {details ? "Hide details" : "Details"}
            </button>
            {details && (
              <div className="space-y-2 text-base">
                {task.detail && <p>{task.detail}</p>}
                <p className="flex flex-wrap items-center gap-2">
                  <span className={statusTag}>{statusText(task.status)}</span>
                  <span className="text-muted">
                    Priority <span className="font-mono">{task.priority}</span>, {task.risk} risk,{" "}
                    {minutesLeft >= 0 ? `answer within ${minutesLeft} min` : `deadline passed ${-minutesLeft} min ago`}
                  </span>
                </p>
                <p className="text-muted">Task <span className="font-mono">{task._id}</span>, {task.type}</p>
                {task.history.length > 0 && <History entries={task.history} now={now} />}
              </div>
            )}

          {panel === "eta" && (
            <section className="space-y-3">
              <h2 className="text-xl font-bold">How long until you get there?</h2>
              <div className="grid grid-cols-2 gap-3">
                {ETAS.map((m) => (
                  <button key={m} className={big(button.outline)} disabled={busy}
                    onClick={() => report({ type: "answer", payload: { taskId: task._id, result: "accepted", etaMinutes: m, progress: "en_route" } },
                      `On our way, ${m} min`, 1)}>
                    {m} min
                  </button>
                ))}
              </div>
              <button className={quiet} onClick={() => setPanel(null)}>Cancel</button>
            </section>
          )}

          {panel === "done" && (
            <section className="space-y-3">
              <label className="block text-xl font-bold" htmlFor="done-note">What happened? (optional)</label>
              <textarea id="done-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)}
                className="w-full rounded-button border-2 border-ink p-3 text-lg" />
              <button className={big(button.primary)} disabled={busy}
                onClick={() => report({ type: "answer", payload: { taskId: task._id, result: "done", note: note.trim() || "Done" } },
                  "Done", 3)}>
                Send done
              </button>
              <button className={quiet} onClick={() => setPanel(null)}>Cancel</button>
            </section>
          )}

          {panel === "problem" && (
            <section className="space-y-3">
              <h2 className="text-xl font-bold">What is the problem?</h2>
              {PROBLEMS.map((p) => (
                <button key={p.kind} className={big(button.outline)} disabled={busy} onClick={() => problem(p)}>
                  {p.label}
                </button>
              ))}
              <button className={quiet} onClick={() => setPanel(null)}>Cancel</button>
            </section>
          )}

          {panel === null && (
            <section className="space-y-3">
              <button className={primaryIf(0)} disabled={busy} onClick={() => setPanel("eta")}>On our way</button>
              <button className={primaryIf(1)} disabled={busy}
                onClick={() => report({ type: "answer", payload: { taskId: task._id, result: "accepted", etaMinutes: 0, progress: "arrived" } },
                  "Arrived", 2)}>
                Arrived
              </button>
              <button className={primaryIf(2)} disabled={busy} onClick={() => setPanel("done")}>Done</button>
              <button className={`${big(button.act)} mt-3`} disabled={busy} onClick={() => setPanel("problem")}>
                Problem
              </button>
            </section>
          )}
          </section>
        </>
      )}

      {others.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xl font-bold">Your other tasks ({others.length})</h2>
          {others.map((o) => <OtherRow key={o.task._id} o={o} now={now} onPick={choose} />)}
        </section>
      )}

      <section className="space-y-2 border-t border-line pt-4">
        <h2 className="text-xl font-bold">Your agent</h2>
        <button
          className={`${big(talk.state === "recording" ? `${button.primary} bg-primary-dark!` : button.primary)} rounded-pill! min-h-24 touch-none select-none [-webkit-touch-callout:none]`}
          disabled={talk.state === "unsupported" || talk.state === "sending"}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); talk.start(); }}
          onPointerUp={talk.stop}
          onPointerCancel={talk.stop}
          onKeyDown={(e) => {
            if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); talk.start(); }
          }}
          onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") talk.stop(); }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {talk.state === "recording" ? "Recording, let go to send"
            : talk.state === "starting" ? "Starting the microphone"
            : talk.state === "sending" ? "Sending"
            : "Hold to talk"}
        </button>
        {talk.state === "unsupported" && (
          <p className="text-base text-muted">The microphone only works on an HTTPS page. Type to your agent instead.</p>
        )}
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); talk.sendText(typed); setTyped(""); }}>
          <label htmlFor="agent-text" className="sr-only">Tell your agent</label>
          <input id="agent-text" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Or type to your agent"
            className="min-w-0 flex-1 rounded-button border-2 border-ink p-3 text-lg" />
          <button type="submit" className={`${button.outline} px-4! text-lg!`}
            disabled={!typed.trim() || talk.state === "sending" || talk.state === "recording"}>
            Send
          </button>
        </form>
        <div aria-live="polite" className="space-y-2">
          {talk.said && <ChatLine m={{ from: "user", text: talk.said }} name="You" />}
          {talk.state === "sending" && <p className="text-base text-muted">Your agent is answering</p>}
          {talk.error && <p className="text-base">{talk.error}</p>}
          {talk.reply && <ChatLine m={{ from: "agent", text: talk.reply }} name="" />}
        </div>
        {talk.speaking && <button className={quiet} onClick={talk.hush}>Stop reading aloud</button>}
      </section>
    </main>
  );
}
