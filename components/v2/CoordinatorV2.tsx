"use client";
// v2 coordinator: decisions first, then what the desk did on its own, problems, and the shift handoff.
import { useState } from "react";
import type { Task } from "@/lib/types";
import { fromBoard } from "../coordinator/coordinatorItems";
import { useDesk } from "./useDesk";
import { nameOf, type V2Board } from "./boardModel";
import { ago, clock, DemoLine, TierBadge, TopBar } from "./ui";

type Sent = { busy: boolean; text?: string; ok?: boolean };

const INCIDENT_LABEL: Record<string, string> = {
  vehicle_breakdown: "Vehicle broke down", road_blocked: "Road blocked", cannot_find: "Cannot find the place",
  short_supply: "Not enough stock", unsafe: "Unsafe", injury: "Someone hurt", handover: "Shift ending",
  unreachable: "Not answering", other: "Other problem",
};

export function CoordinatorV2({ initial, userId }: { initial: V2Board; userId: string }) {
  const { data: b, live, now, demo } = useDesk<V2Board>("/api/board", initial);
  const { approvals, escalated, problems } = fromBoard(b);

  // What the dispatcher handed out without asking: open tasks with an owner, newest first.
  const auto = b.tasks
    .filter((t) => t.open && t.assignee && t.risk === "low")
    .map((t) => ({ t, at: t.history[t.history.length - 1]?.ts ?? t.deadline }))
    .sort((x, y) => +new Date(y.at) - +new Date(x.at))
    .slice(0, 5);

  return (
    <>
      <TopBar health={b.health} live={live} demo={demo} approvals={approvals.length} who={`${nameOf(userId)}, coordinator`} />
      <DemoLine live={live} demo={demo} />
      <main className="flex flex-wrap items-start gap-5 p-6">
        <section aria-label="Decisions" className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h1 className="text-[26px] font-bold tracking-tight">Waiting for your decision</h1>
            <span className="text-sm muted">Rules propose. You decide. Every answer goes into the record history.</span>
          </div>
          {approvals.length === 0 && (
            <div className="card p-5 text-sm muted">Nothing waits for you. High-risk work (sending a field team, evacuations, big supply moves) will appear here.</div>
          )}
          {approvals.map(({ task, about }) => (
            <ApprovalV2 key={task._id} task={task} about={about} userId={userId} now={now} />
          ))}

          {escalated.length > 0 && (
            <section className="card p-5">
              <h2 className="text-base font-bold">Nobody fits these, you decide who</h2>
              <ul className="mt-2 flex flex-col">
                {escalated.map(({ task, about }) => (
                  <li key={task._id} className="flex items-center gap-3 border-t py-2.5 text-sm" style={{ borderColor: "var(--v2-line-2)" }}>
                    <TierBadge tier={task.tier} />
                    <span className="min-w-0 flex-1"><span className="font-semibold">{task.title}</span> <span className="muted">{about.name}, tried {task.tried.length}</span></span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-label="What the dispatcher did" className="card px-5 py-[18px]">
            <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-base font-bold">Handed out without you</h2>
              <span className="text-[13px] muted">low-risk work goes straight to people</span>
            </div>
            {auto.length === 0 && <p className="text-sm muted">Nothing yet.</p>}
            <ul className="flex flex-col">
              {auto.map(({ t, at }) => (
                <li key={t._id} className="grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-3 border-t py-2.5 text-sm" style={{ borderColor: "var(--v2-line-2)" }}>
                  <span className="mono text-[13px] faint">{clock(at)}</span>
                  <span className="min-w-0">{t.title}, to <span className="font-semibold">{nameOf(t.assignee)}</span></span>
                  <span className="text-xs muted">{t.status.replace("_", " ")}</span>
                </li>
              ))}
            </ul>
          </section>
        </section>

        <aside aria-label="Problems and handoff" className="flex min-w-0 max-w-[480px] flex-[1_1_360px] flex-col gap-4">
          <section className="card flex flex-col gap-3 px-5 py-[18px]" style={{ borderColor: problems.length ? "var(--v2-act-line)" : undefined }}>
            <div className="flex items-center gap-2">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="fg-act"><path d="M10 3l8 14H2L10 3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M10 8v4M10 14.5v.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
              <h2 className="text-base font-bold">Problems in the field</h2>
              <span className="flex-1" />
              {problems.length > 0 && <span className="chip chip-act px-2 py-0.5 text-xs">{problems.length} open</span>}
            </div>
            {problems.length === 0 && <p className="text-sm muted">No open problems.</p>}
            {problems.map((i) => (
              <div key={i._id} className="rounded-xl border p-3.5" style={{ borderColor: "var(--v2-line-2)" }}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-base font-bold">{INCIDENT_LABEL[i.kind] ?? i.kind}</span>
                  <span className="mono text-xs muted">{i._id}, {i.severity}</span>
                </div>
                <div className="mt-1 text-sm" style={{ color: "var(--v2-ink-2)" }}>{i.textEn}. By {nameOf(i.reportedBy)}{i.canContinue ? ", can continue" : ", cannot continue"}.</div>
                <div lang="tr" className="mt-2 text-[13px] italic muted">{i.text}</div>
                <div className="eyebrow mt-3.5">What the desk already did</div>
                {i.actions.length === 0 && <p className="mt-1 text-sm muted">Nothing yet. The Brain picks it up on its next loop.</p>}
                <ol className="mt-2 flex flex-col gap-2">
                  {i.actions.map((a, k) => (
                    <li key={k} className="flex items-start gap-2.5 text-sm">
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" className="fg-ok mt-px flex-none"><circle cx="9" cy="9" r="8" stroke="currentColor" strokeWidth="1.6" /><path d="M5.5 9.2l2.3 2.3 4.7-4.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      <span>{a.what} <span className="mono text-xs faint">{clock(a.ts)}</span></span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </section>
          <Handoff userId={userId} />
        </aside>
      </main>
    </>
  );
}

function ApprovalV2({ task, about, userId, now }: {
  task: Task; about: ReturnType<typeof fromBoard>["approvals"][number]["about"]; userId: string; now: number;
}) {
  const [sent, setSent] = useState<Sent>({ busy: false });
  const overdue = new Date(task.deadline).getTime() < now;
  const waitedFrom = task.history[0]?.ts ?? task.deadline;
  const conf = { unconfirmed: ["Unconfirmed", "fg-urgent"], corroborated: ["Corroborated", "fg-primary"], confirmed: ["Confirmed", "fg-ok"] }[about.confidence];

  async function answer(approved: boolean) {
    setSent({ busy: true, text: "Sending" });
    try {
      const r = await fetch(`/api/events?user=${encodeURIComponent(userId)}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "approval", source: "person", dedupeKey: `approval:${task._id}`, payload: { taskId: task._id, approved } }),
      });
      if (r.ok) setSent({ busy: false, ok: true, text: approved ? "Approved. The desk sends it on its next loop." : "Rejected. The desk looks for another way." });
      else {
        const j = (await r.json().catch(() => null)) as { error?: string } | null;
        setSent({ busy: false, text: `Not sent: ${j?.error ?? `the desk answered ${r.status}`}` });
      }
    } catch {
      setSent({ busy: false, text: "Not sent: the desk did not answer" });
    }
  }

  return (
    <article className={`card flex flex-col gap-3.5 p-5 ${overdue && !sent.ok ? "late" : ""}`} style={{ borderRadius: 16 }}>
      <div className="flex flex-wrap items-center gap-2">
        <TierBadge tier={task.tier} />
        <span className="eyebrow">{task.type}, {task.risk} risk</span>
        <span className="flex-1" />
        <span className={`chip mono px-2.5 py-1 text-[13px] ${overdue ? "chip-act" : "chip-grey"}`}>
          {overdue ? `overdue, waiting ${ago(waitedFrom, now)}` : `waiting ${ago(waitedFrom, now)}`}
        </span>
      </div>
      <h2 className="text-xl font-bold">{task.title}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="panel-soft px-3 py-2.5"><div className="text-xs muted">Record</div><div className="text-sm font-semibold">{about.name}</div></div>
        <div className="panel-soft px-3 py-2.5"><div className="text-xs muted">How sure</div><div className={`text-sm font-semibold ${conf[1]}`}>{conf[0]}{about.sources ? `, ${about.sources} sources` : ""}</div></div>
        <div className="panel-soft px-3 py-2.5"><div className="text-xs muted">Tried before</div><div className="text-sm font-semibold">{task.tried.length ? task.tried.map(nameOf).join(", ") : "nobody"}</div></div>
      </div>
      <p className="text-sm leading-relaxed" style={{ color: "var(--v2-ink-2)" }}>
        <span className="font-bold" style={{ color: "var(--v2-urgent-ink)" }}>Why </span>{task.detail}
      </p>
      {sent.ok ? (
        <div className="ok-banner px-3.5 py-3 text-sm">{sent.text}</div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <button disabled={sent.busy} onClick={() => answer(true)} className="btn btn-dark flex-[2_1_160px]" style={{ minHeight: 48, fontSize: 15, fontWeight: 700 }}>Approve</button>
            <button disabled title="Waits for Role 1: an approval that names another person" className="btn btn-ghost flex-[1_1_120px]" style={{ minHeight: 48 }}>Change who</button>
            <button disabled={sent.busy} onClick={() => answer(false)} className="btn btn-danger flex-[1_1_120px]" style={{ minHeight: 48 }}>Reject</button>
          </div>
          {sent.text && <p className="text-sm" role="status">{sent.text}</p>}
        </>
      )}
    </article>
  );
}

function Handoff({ userId }: { userId: string }) {
  const [state, setState] = useState<{ busy: boolean; text?: string }>({ busy: false });
  async function write() {
    setState({ busy: true });
    try {
      const r = await fetch(`/api/chat?user=${encodeURIComponent(userId)}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "Write the shift handoff note for the next coordinator." }),
      });
      const j = (await r.json().catch(() => null)) as { reply?: string; error?: string } | null;
      setState({ busy: false, text: j?.reply ?? j?.error ?? `The desk answered ${r.status}` });
    } catch {
      setState({ busy: false, text: "The agent did not answer." });
    }
  }
  return (
    <section className="night-card flex flex-col gap-3 px-5 py-[18px]">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">Shift handoff</h2>
        <span className="soft text-xs">written from the desk, with sources</span>
      </div>
      {!state.text && (
        <ul className="soft flex flex-col gap-1.5 text-sm">
          <li><span className="q font-bold">What did the last shift get done?</span></li>
          <li><span className="q font-bold">What needs my decision now?</span></li>
          <li><span className="q font-bold">Who is in danger with nobody on it?</span></li>
          <li><span className="q font-bold">What is running short?</span></li>
          <li><span className="q font-bold">What should I not trust yet?</span></li>
        </ul>
      )}
      {state.text && <p className="whitespace-pre-line text-sm leading-relaxed">{state.text}</p>}
      <button onClick={write} disabled={state.busy} className="btn btn-brand" style={{ fontWeight: 700 }}>
        {state.busy ? "Writing, about 20 s" : state.text ? "Write it again" : "Write the handoff"}
      </button>
      <p className="soft text-xs">Ends with a public notice draft from confirmed facts only. Nothing is published without you.</p>
    </section>
  );
}
