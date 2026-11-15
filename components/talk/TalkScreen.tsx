"use client";
// /talk: one person and their own agent, voice first. Hold the button and talk: your wave moves
// while you speak, ElevenLabs writes down what it heard, the agent files it and answers out loud,
// and its wave moves while it speaks. What the agent filed shows as chips under its answer.
// Typing still works. Owner: Role 2.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Waveform } from "./Waveform";
import { useVoice } from "./useVoice";
import { chip, pill, tierBadge, tierText } from "@/components/encode";
import type { Tier } from "@/lib/types";

export interface TalkTask { id: string; title: string; detail: string; tier: Tier; status: string }
export interface TalkQuake { line: string; mag: number; minutesAgo: number }
export interface TalkPerson { id: string; name: string; role: string }

interface Turn {
  id: number;
  from: "person" | "agent";
  text: string;
  voice?: boolean;                       // the person spoke it (ElevenLabs heard it)
  actions?: { tool: string; summary: string; ok: boolean }[];
}

const TOOL_WORD: Record<string, string> = {
  answer_task: "Task", file_need: "Need", file_report: "Report", file_closure: "Road",
  file_capacity: "Shelter", report_problem: "Problem", declare_work: "Doing", correct_record: "Fix",
  decide_approval: "Decision", shift_handoff: "Handoff",
};

/** "Problem: road_blocked on task task-5" → "road blocked": no internal ids on screen. */
function chipText(summary: string): string {
  return summary.replace(/^[A-Za-z ]+: /, "").replace(/ on task [\w-]+/g, "").replace(/\b(task|site|need|inc)-\w+/g, "")
    .replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

export function TalkScreen({ me, people, task, quakes, voiceOn }: {
  me: TalkPerson; people: TalkPerson[]; task?: TalkTask; quakes: TalkQuake[]; voiceOn: boolean;
}) {
  const router = useRouter();
  const voice = useVoice();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [state, setState] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [typed, setTyped] = useState("");
  const [speakReplies, setSpeakReplies] = useState(true);
  const seq = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [turns, state]);
  // Aftershocks and the task card come from the server: refresh them every 30 s.
  useEffect(() => { const t = setInterval(() => router.refresh(), 30_000); return () => clearInterval(t); }, [router]);

  const add = (t: Omit<Turn, "id">) => setTurns((xs) => [...xs, { ...t, id: ++seq.current }]);

  async function send(body: { text?: string; audioBase64?: string }) {
    setState("thinking");
    try {
      const res = await fetch(`/api/chat?user=${encodeURIComponent(me.id)}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, speak: speakReplies && voiceOn }),
      });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error ?? `HTTP ${res.status}`);
      if (body.audioBase64) add({ from: "person", text: r.heard || "(nothing heard)", voice: true });
      add({ from: "agent", text: r.reply, actions: r.actions });
      if (r.replyAudio) {
        setState("speaking");
        await voice.play(r.replyAudio).catch(() => {});
      }
    } catch (e) {
      add({ from: "agent", text: `Something went wrong: ${(e as Error).message}. Try again.` });
    } finally {
      setState("idle");
    }
  }

  async function pressStart() {
    if (state !== "idle") return;
    if (await voice.start()) setState("listening");
  }
  async function pressEnd() {
    if (state !== "listening") return;
    const note = await voice.stop();
    if (!note) { setState("idle"); voice.setError("Hold the button while you talk."); return; }
    await send({ audioBase64: note });
  }
  async function submitTyped(e: React.FormEvent) {
    e.preventDefault();
    const text = typed.trim();
    if (!text || state !== "idle") return;
    setTyped("");
    add({ from: "person", text });
    await send({ text });
  }

  const fresh = quakes.filter((q) => q.minutesAgo <= 30);

  return (
    <main className="mx-auto flex h-full max-w-md flex-col gap-3 p-3">
      <nav className="flex flex-wrap gap-2" aria-label="Talk as">
        {people.map((p) => (
          <a key={p.id} href={`/talk?user=${p.id}`} className={chip(p.id === me.id)}>{p.name}</a>
        ))}
      </nav>

      {fresh.length > 0 && (
        <section role="alert" className="rounded-card border-2 border-act bg-act-soft p-3">
          <p className="text-sm font-bold text-act">Aftershock near you</p>
          {fresh.map((q) => <p key={q.line} className="mt-1 text-sm text-ink">{q.line}</p>)}
          <p className="mt-1 text-sm text-ink">Get out of damaged buildings and stay clear until the shaking has stopped.</p>
        </section>
      )}

      <section className="rounded-card border border-line bg-card p-3">
        <p className="text-xs uppercase text-muted">{me.name} · {me.role} · your top task</p>
        {task ? (
          <div className="mt-1 flex items-start gap-2">
            <span className={`${tierBadge(task.tier)} rounded-tag px-1.5 py-0.5 text-xs`}>
              <span className="font-mono">{tierText(task.tier).code}</span>
            </span>
            <div className="min-w-0">
              <p className="font-bold text-ink">{task.title}</p>
              <p className="text-sm text-muted">{task.detail}</p>
            </div>
          </div>
        ) : <p className="mt-1 text-sm text-muted">Nothing assigned to you right now.</p>}
      </section>

      <section className="flex min-h-40 flex-1 flex-col gap-3 overflow-y-auto" aria-live="polite">
        {turns.length === 0 && (
          <p className="m-auto max-w-xs text-center text-sm text-muted">
            Hold the button and tell your agent what you see or need. It files it on the desk and answers out loud.
          </p>
        )}
        {turns.map((t) => (
          <div key={t.id} className={t.from === "person" ? "self-end text-right" : "self-start"}>
            <p className={`inline-block max-w-[85%] rounded-card px-3 py-2 text-left text-sm ${
              t.from === "person" ? "bg-primary text-card" : "border border-line bg-card text-ink"}`}>
              {t.voice && <span className="mb-0.5 block text-xs opacity-80">heard</span>}
              {t.text}
            </p>
            {t.actions && t.actions.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {t.actions.map((a, i) => (
                  <span key={i} className={pill} title={a.summary}>
                    <span className="font-bold">{a.ok ? TOOL_WORD[a.tool] ?? a.tool : "Not filed"}</span>
                    <span className="text-muted">{chipText(a.summary)}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {state === "thinking" && <p className="self-start text-sm text-muted">Your agent is working…</p>}
        <div ref={bottom} />
      </section>

      <section className="rounded-card border border-line bg-card p-3">
        <Waveform
          analyser={state === "speaking" ? voice.agentAnalyser : voice.micAnalyser}
          tone={state === "speaking" ? "agent" : "person"}
          label={state === "speaking" ? "Your agent is speaking" : state === "listening" ? "Listening to you" : "Quiet"}
        />
        <p className="mb-2 text-center text-xs text-muted" aria-live="polite">
          {state === "listening" ? "Listening… let go to send" : state === "thinking" ? "Your agent is filing it…"
            : state === "speaking" ? "Your agent is answering" : voiceOn ? "Hold to talk" : "Voice is off on this server: type instead"}
        </p>
        <button
          type="button"
          disabled={!voiceOn || (state !== "idle" && state !== "listening")}
          onPointerDown={(e) => { e.preventDefault(); void pressStart(); }}
          onPointerUp={() => void pressEnd()}
          onPointerLeave={() => void pressEnd()}
          onContextMenu={(e) => e.preventDefault()}
          className={`block w-full select-none rounded-pill py-5 text-xl font-bold text-card transition-transform disabled:opacity-40 ${
            state === "listening" ? "scale-[0.98] bg-act" : "bg-primary hover:bg-primary-dark"}`}
        >
          {state === "listening" ? "Listening" : "Hold to talk"}
        </button>
        {voice.error && <p className="mt-2 text-center text-sm text-act">{voice.error}</p>}
        <form onSubmit={submitTyped} className="mt-3 flex gap-2">
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Or type it…"
            className="min-w-0 flex-1 rounded-button border border-line px-2 py-1.5 text-sm" />
          <button className="rounded-button border border-line px-3 text-sm font-bold text-primary" disabled={state !== "idle"}>Send</button>
        </form>
        <label className="mt-2 flex items-center justify-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={speakReplies} onChange={(e) => setSpeakReplies(e.target.checked)} />
          Read answers out loud
        </label>
      </section>
    </main>
  );
}
