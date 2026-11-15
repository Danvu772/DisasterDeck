"use client";
// v2 volunteer desk: the next call as one big card, the person's agent beside it.
// Outcome buttons talk to the agent, which files the answer. Task buttons post events directly,
// so the desk still works when the model is slow.
import { useEffect, useRef, useState } from "react";
import type { Task } from "@/lib/types";
import { useDesk } from "./useDesk";
import { sendTaskEvent, taskEventBody, type TaskAction } from "../taskEvents";
import { nameOf, openTasks, type V2Board } from "./boardModel";
import { DemoLine, TierBadge, TopBar } from "./ui";

type Msg = { from: "agent" | "me"; text: string; filed?: string[] };
type ChatReply = { reply?: string; error?: string; actions?: { tool: string; summary: string; ok: boolean }[] };

const OUTCOMES = [
  { id: "voices", label: "Voices heard", say: "I called. Voices heard, the person is still inside." },
  { id: "noanswer", label: "No answer", say: "I called. Nobody answered." },
  { id: "rescued", label: "Already rescued", say: "I called. They say the person was already rescued." },
  { id: "wrong", label: "Wrong address", say: "I called. The address in the post is wrong." },
];

export function VolunteerV2({ initial, userId }: { initial: V2Board; userId: string }) {
  const { data: b, live, demo } = useDesk<V2Board>("/api/board", initial);
  const mine = openTasks(b.tasks, userId);
  const top = mine[0];
  const site = top ? b.sites.find((s) => s._id === top.recordId) : undefined;

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  // The agent's first line names the top task, like the personal agent does.
  useEffect(() => {
    setMsgs((m) => (m.length ? m : [{
      from: "agent",
      text: top
        ? `Your top task: ${top.title}. ${top.detail}`
        : "You have no open tasks. Ask me anything about the desk, or tell me what you are doing.",
    }]));
  }, [top]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs]);

  async function say(t: string) {
    const clean = t.trim();
    if (!clean || busy) return;
    setMsgs((m) => [...m, { from: "me", text: clean }]);
    setText("");
    setBusy(true);
    try {
      const r = await fetch(`/api/chat?user=${encodeURIComponent(userId)}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: clean }),
      });
      const j = (await r.json().catch(() => null)) as ChatReply | null;
      setMsgs((m) => [...m, {
        from: "agent",
        text: j?.reply ?? j?.error ?? `The desk answered ${r.status}.`,
        filed: (j?.actions ?? []).filter((a) => a.ok).map((a) => a.summary),
      }]);
    } catch {
      setMsgs((m) => [...m, { from: "agent", text: "I could not reach the desk. Your task buttons still work." }]);
    }
    setBusy(false);
  }

  async function press(task: Task, a: TaskAction) {
    setStatus("Sending");
    setStatus(await sendTaskEvent(userId, taskEventBody(task._id, a)));
  }

  return (
    <>
      <TopBar health={b.health} live={live} demo={demo} who={`${nameOf(userId)}, call volunteer`} />
      <DemoLine live={live} demo={demo} />
      <main className="flex flex-1 flex-wrap items-stretch gap-5 p-6">
        <section aria-label="Your next task" className="flex min-w-0 max-w-[560px] flex-[1_1_420px] flex-col gap-4">
          <div className="flex items-baseline justify-between gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{top?.type === "call" ? "Your next call" : "Your next task"}</h1>
            <span className="text-[13px] muted">{mine.length} open, highest first</span>
          </div>

          {!top && <div className="card p-5 text-sm muted">Nothing is assigned to you right now. New calls appear here the moment the desk hands them out.</div>}

          {top && (
            <article className="card-strong flex flex-col gap-4 p-[22px]">
              <div className="flex flex-wrap items-center gap-2">
                <TierBadge tier={top.tier} />
                <span className="eyebrow">{top.type}, <span className="mono normal-case">{top.recordId}</span></span>
                <span className="flex-1" />
                <span className="mono text-[13px] font-semibold fg-act">answer by {new Date(top.deadline).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <div>
                <h2 className="text-[22px] font-bold">{site?.address ?? top.title}</h2>
                <p className="mt-1.5 text-[15px]" style={{ color: "var(--v2-ink-2)" }}>{top.detail}</p>
              </div>

              {top.type === "call" && (
                <>
                  <div>
                    <div className="eyebrow">Ask</div>
                    <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-sm">
                      <li>Is anyone still trapped right now? How many?</li>
                      <li>Can you hear them? Any phone contact?</li>
                      <li>The exact entrance: street, building, which side.</li>
                    </ul>
                  </div>
                  <div>
                    <div className="eyebrow mb-2">What did you hear?</div>
                    <div className="grid grid-cols-2 gap-2">
                      {OUTCOMES.map((o) => (
                        <button key={o.id} aria-pressed={picked === o.id} disabled={busy}
                          onClick={() => { setPicked(o.id); say(`${o.say} (${top.recordId})`); }}
                          className="btn-choice min-h-[52px] rounded-xl px-3.5 text-[15px] font-semibold">
                          {o.label}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-xs muted">Your agent files the answer and updates the site.</p>
                  </div>
                </>
              )}

              <div className="flex flex-wrap gap-2">
                {top.status === "assigned" && (
                  <button className="btn btn-dark flex-[1_1_120px]" onClick={() => press(top, "accepted")}>I take it</button>
                )}
                <button className="btn btn-ghost flex-[1_1_120px]" onClick={() => press(top, "declined")}>Can’t take it</button>
                <button className="btn btn-ghost flex-[1_1_120px]" onClick={() => press(top, "done")}>Done</button>
              </div>
              {status && <p role="status" className="text-sm muted">{status}</p>}
            </article>
          )}

          {mine.slice(1, 4).map((t) => (
            <article key={t._id} className="card flex items-center gap-3 px-[18px] py-4">
              <TierBadge tier={t.tier} />
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold">{t.title}</div>
                <div className="truncate text-[13px] muted">{t.detail}</div>
              </div>
              <span className="text-xs muted">next</span>
            </article>
          ))}
        </section>

        <section aria-label="Your agent" className="card flex min-w-0 flex-[999_1_480px] flex-col overflow-hidden" style={{ borderRadius: 18 }}>
          <div className="flex items-center gap-2.5 border-b px-5 py-4" style={{ borderColor: "var(--v2-line-2)" }}>
            <div className="flex-1">
              <h2 className="text-base font-bold">Your agent</h2>
              <p className="text-xs muted">Reads the desk for you and files what you tell it. Every fact comes with its source and age.</p>
            </div>
          </div>
          <div className="flex min-h-[420px] flex-1 flex-col gap-3.5 overflow-y-auto p-5" style={{ background: "var(--v2-soft)" }}>
            {msgs.map((m, i) => (
              <div key={i} className={`flex flex-col gap-1.5 ${m.from === "me" ? "items-end" : "items-start"}`}>
                <div className={`max-w-[78%] whitespace-pre-line rounded-2xl px-3.5 py-3 text-[15px] leading-relaxed ${m.from === "me" ? "bubble-me" : "bubble-agent"}`}>{m.text}</div>
                {m.filed?.map((f, k) => (
                  <span key={k} className="filed inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold">Filed: {f}</span>
                ))}
              </div>
            ))}
            {busy && <div className="bubble-agent self-start rounded-2xl px-3.5 py-3 text-[15px] muted">Working on it</div>}
            <div ref={end} />
          </div>
          <form className="flex items-center gap-2 border-t p-3.5" style={{ borderColor: "var(--v2-line-2)" }}
            onSubmit={(e) => { e.preventDefault(); say(text); }}>
            <label htmlFor="v2-msg" className="sr-only">Message your agent</label>
            <input id="v2-msg" value={text} onChange={(e) => setText(e.target.value)} placeholder="Tell your agent what happened, in any language"
              className="min-h-[48px] flex-1 rounded-xl border px-3.5 text-[15px]" style={{ borderColor: "var(--v2-line)" }} />
            <button type="submit" disabled={busy || !text.trim()} className="btn btn-blue" style={{ minHeight: 48 }}>Send</button>
          </form>
        </section>
      </main>
    </>
  );
}
