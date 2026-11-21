"use client";
// /talk: one person and their own agent, voice first, laid out like a phone voice mode.
// A big button sits at the bottom centre: hold it (or the space bar) and talk; let go and the note
// goes to your agent. The conversation flows top to bottom above it. While you talk, your words show
// live (Amazon Transcribe streaming). The agent's answer streams in as it is written, and each
// finished sentence is read out loud while the next is still coming. Nothing reaches the desk yet:
// the agent only prepares it, and once the answer has been read a card asks "Send this to the desk?".
// Rebuilt on USWDS (D-0001): react-uswds components and usa-* tokens, no shadcn, no motion.
import {
  ChevronDown, CircleCheck, CircleX, ClipboardList, HeartPulse, Keyboard, Mic, SendHorizontal, Siren,
  SlidersHorizontal, Truck, Volume2, VolumeX, X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Tier } from "@/lib/types";
import { Alert, Button, TextInput } from "@trussworks/react-uswds";
import { VoiceOrb } from "./VoiceOrb";
import { useVoice, type VoiceState } from "./useVoice";

export interface TalkTask { id: string; title: string; detail: string; tier: Tier; status: string }
export interface TalkQuake { line: string; mag: number; minutesAgo: number }
export interface TalkPerson { id: string; name: string; role: string }

interface Turn {
  id: number;
  from: "person" | "agent";
  text: string;
  voice?: boolean;                       // the person spoke it (Transcribe heard it)
  speaking?: boolean;                    // agent: the voice is reading it out right now
  actions?: { tool: string; summary: string; ok: boolean }[];
  // agent: what the desk would get, waiting for the person's yes
  pending?: { id: string; items: string[]; state: "ask" | "sending" | "sent" | "dropped" | "error"; error?: string };
}

const TOOL_WORD: Record<string, string> = {
  answer_task: "Task", file_need: "Need", file_report: "Report", file_closure: "Road",
  file_capacity: "Shelter", report_problem: "Problem", declare_work: "Doing", correct_record: "Fix",
  decide_approval: "Decision", shift_handoff: "Handoff", show_on_map: "Map",
};

const ROLE_WORD: Record<string, string> = {
  field: "Field team", volunteer: "Volunteer", supplier: "Supplier", shelter: "Shelter desk",
  coordinator: "Coordinator", citizen: "Citizen", public: "Citizen",
};
const roleWord = (r: string) => ROLE_WORD[r] ?? r.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase());

const SUGGEST = [
  "Two people are trapped at Örnek Street 12",
  "We need 20 blankets at Shelter B",
  "The road to the hospital is blocked",
];

/** "Problem: road_blocked on task task-5" → "road blocked": no internal ids on screen. */
function chipText(summary: string): string {
  return summary.replace(/^[A-Za-z ]+: /, "").replace(/ on task [\w-]+/g, "").replace(/\b(task|site|need|inc)-\w+/g, "")
    .replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

const initialsOf = (name: string) => name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

/** A small panel that drops down from the top bar. No motion (D-0001): it appears and disappears. */
function Panel({ open, onClose, title, children, align = "left" }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode; align?: "left" | "right";
}) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div role="dialog" aria-label={title}
        className={cn("absolute top-12 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-md border border-usa-base-lighter bg-usa-white p-3 text-usa-ink shadow-lg",
          align === "left" ? "left-0" : "right-0")}>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium text-usa-base-dark">{title}</p>
          <Button type="button" unstyled onClick={onClose} aria-label="Close"><X /></Button>
        </div>
        {children}
      </div>
    </>
  );
}

export function TalkScreen({ me, people, tasks, quakes, voiceOn }: {
  me: TalkPerson; people: TalkPerson[]; tasks: TalkTask[]; quakes: TalkQuake[]; voiceOn: boolean;
}) {
  const router = useRouter();
  const voice = useVoice(me.id);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [state, setStateRaw] = useState<VoiceState>("idle");
  const stateRef = useRef<VoiceState>("idle");
  const setState = useCallback((s: VoiceState) => { stateRef.current = s; setStateRaw(s); }, []);
  const [typing, setTyping] = useState(!voiceOn);
  const [typed, setTyped] = useState("");
  const [speakReplies, setSpeakReplies] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [panel, setPanel] = useState<"people" | "tasks" | "settings" | null>(null);
  const seq = useRef(0);
  const holding = useRef(false);
  const talkId = useRef(0);          // the current send(); a newer one (or talking over) retires the old
  const [answering, setAnswering] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  // Keep the newest line in view while it flows.
  const toBottom = useCallback(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);
  const lastTurn = turns.at(-1);
  useEffect(toBottom, [turns.length, state, toBottom, lastTurn?.speaking, lastTurn?.pending?.state, lastTurn?.text, voice.partial]);
  // Aftershocks and the task list come from the server: refresh them every 30 s.
  useEffect(() => { const t = setInterval(() => router.refresh(), 30_000); return () => clearInterval(t); }, [router]);

  // The id is taken here, not inside the updater: React may run an updater twice (Strict Mode).
  const add = (t: Omit<Turn, "id">) => { const id = ++seq.current; setTurns((xs) => [...xs, { ...t, id }]); return id; };
  /** The voice is done (or was talked over): the "send this?" card may show. */
  const stopSpeaking = useCallback((id?: number) =>
    setTurns((xs) => xs.map((t) => (t.speaking && (id === undefined || t.id === id) ? { ...t, speaking: false } : t))), []);
  const patchTurn = (id: number, f: (t: Turn) => Turn) => setTurns((xs) => xs.map((t) => (t.id === id ? f(t) : t)));

  /** One turn, streamed: text as it is written, each sentence's voice as soon as it is ready. */
  async function send(body: { text?: string; audioBase64?: string }) {
    const my = ++talkId.current;
    const mine = () => talkId.current === my;
    if (speakReplies && voiceOn) voice.prime();   // still inside the click: lets the reply play
    setState("thinking");
    setAnswering(false);
    let agentId: number | null = null;
    let text = "";
    let spoke = false;
    try {
      const res = await fetch(`/api/chat?user=${encodeURIComponent(me.id)}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, speak: speakReplies && voiceOn, speechSpeed: speed, confirm: true, stream: true }),
      });
      if (!res.ok || !res.body) {
        const r = await res.json().catch(() => ({}));
        throw new Error(r.error ?? `HTTP ${res.status}`);
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        for (let nl = buf.indexOf("\n"); nl >= 0; nl = buf.indexOf("\n")) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const m = JSON.parse(line) as { type: string; [k: string]: unknown };
          if (m.type === "heard") {
            add({ from: "person", text: String(m.text || "(nothing heard)"), voice: true });
          } else if (m.type === "text") {
            text += String(m.delta);
            const now = text.trimStart();
            if (agentId === null) { agentId = add({ from: "agent", text: now, speaking: true }); setAnswering(true); }
            else { const id = agentId; patchTurn(id, (t) => ({ ...t, text: now })); }
          } else if (m.type === "audio") {
            if (!mine()) continue;   // talked over: the rest of this answer stays silent
            voice.enqueue(String(m.audio));
            spoke = true;
            if (stateRef.current === "thinking") setState("speaking");
          } else if (m.type === "done") {
            const r = m as unknown as { reply: string; actions?: Turn["actions"]; pending?: { id: string; items: string[] } };
            const fields = { text: r.reply, actions: r.actions, pending: r.pending ? { ...r.pending, state: "ask" as const } : undefined };
            if (agentId === null) agentId = add({ from: "agent", speaking: true, ...fields });
            else { const id = agentId; patchTurn(id, (t) => ({ ...t, ...fields })); }
          } else if (m.type === "error") {
            throw new Error(String(m.error));
          }
        }
      }
      if (spoke && mine()) {
        if (stateRef.current === "thinking") setState("speaking");
        await voice.drained();
      }
      if (agentId !== null) stopSpeaking(agentId);
    } catch (e) {
      if (agentId !== null) stopSpeaking(agentId);
      add({ from: "agent", text: `Something went wrong: ${(e as Error).message}. Try again.` });
    } finally {
      setAnswering(false);
      // Only settle if nobody started talking over the answer meanwhile.
      if (mine() && (stateRef.current === "thinking" || stateRef.current === "speaking")) setState("idle");
    }
  }

  async function pressStart() {
    const s = stateRef.current;
    if (s === "thinking" || s === "listening" || !voiceOn) return;
    if (s === "speaking") { talkId.current++; voice.stopPlayback(); stopSpeaking(); }
    holding.current = true;
    setState("listening");           // the button lights up at once, even while the mic is still opening
    const ok = await voice.start();
    if (!ok) { holding.current = false; setState("idle"); return; }
    if (!holding.current) {          // let go before the mic was ready: nothing to send
      voice.cancel();
      setState("idle");
      voice.setError("Hold the button while you talk.");
    }
  }
  async function pressEnd() {
    if (!holding.current) return;
    holding.current = false;
    if (stateRef.current !== "listening") return;
    const got = await voice.stop();
    if (!got) {
      // stop() returns null both for a tap and while the mic is still opening (pressStart handles that).
      if (stateRef.current === "listening") { setState("idle"); voice.setError("Hold the button while you talk."); }
      return;
    }
    if ("text" in got) {
      add({ from: "person", text: got.text, voice: true });
      await send({ text: got.text });
    } else {
      await send({ audioBase64: got.note });
    }
  }
  async function submit(text: string) {
    const t = text.trim();
    if (!t || stateRef.current === "thinking" || stateRef.current === "listening") return;
    if (stateRef.current === "speaking") { talkId.current++; voice.stopPlayback(); stopSpeaking(); }
    setTyped("");
    add({ from: "person", text: t });
    await send({ text: t });
  }

  /** The person's answer to "Send this to the desk?" */
  async function decide(turnId: number, pendingId: string, send: boolean) {
    patchTurn(turnId, (t) => (t.pending ? { ...t, pending: { ...t.pending, state: "sending" } } : t));
    try {
      const res = await fetch(`/api/chat?user=${encodeURIComponent(me.id)}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ approve: pendingId, send }),
      });
      const r = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(r.error ?? "Could not reach the desk. Tap Send to try again.");
      patchTurn(turnId, (t) => ({ ...t, actions: r.sent ? r.actions : t.actions,
        pending: t.pending ? { ...t.pending, state: r.sent ? "sent" : "dropped" } : t.pending }));
    } catch (e) {
      patchTurn(turnId, (t) => (t.pending ? { ...t, pending: { ...t.pending, state: "error", error: (e as Error).message } } : t));
    }
  }

  // Space bar: hold to talk, like the button (not while typing in a field).
  useEffect(() => {
    const inField = (e: KeyboardEvent) => e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable]");
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || inField(e)) return;
      e.preventDefault();
      void pressStart();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space" || inField(e)) return;
      e.preventDefault();
      void pressEnd();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  });

  const fresh = quakes.filter((q) => q.minutesAgo <= 30);
  const status = state === "listening" ? "Listening… let go to send"
    : state === "thinking" ? "Filing it on the desk…"
    : state === "speaking" ? "Your agent is answering · hold to talk over it"
    : voiceOn ? "Hold to talk" : "Voice is off here. Type instead.";
  const lastFrom = turns.at(-1)?.from;

  return (
    <main className="relative mx-auto flex h-full w-full max-w-2xl flex-col px-4">
      {/* Top bar: who you are, your tasks, voice settings */}
      <div className="relative z-20 flex items-center gap-2 pt-3">
        <button type="button" onClick={() => setPanel(panel === "people" ? null : "people")} aria-expanded={panel === "people"}
          className="flex min-w-0 items-center gap-2 rounded-full border border-usa-base-lighter bg-usa-white py-1 pr-3 pl-1 text-left shadow-xs transition-colors hover:bg-usa-base-lightest">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-usa-primary text-[10px] font-semibold text-usa-white">{initialsOf(me.name)}</span>
          <span className="min-w-0">
            <span className="block truncate text-sm leading-tight font-medium text-usa-ink">{me.name}</span>
            <span className="block truncate text-[11px] leading-tight text-usa-base-dark">{roleWord(me.role)}</span>
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-usa-base-dark" />
        </button>
        <div className="flex-1" />
        <Button type="button" outline className="rounded-full" onClick={() => setPanel(panel === "tasks" ? null : "tasks")} aria-expanded={panel === "tasks"}>
          <ClipboardList />Tasks{tasks.length > 0 && <span className="rounded-full bg-usa-primary px-1.5 text-[10px] text-usa-white">{tasks.length}</span>}
        </Button>
        <Button type="button" unstyled aria-pressed={speakReplies} onClick={() => setSpeakReplies((v) => !v)}
          aria-label={speakReplies ? "Stop reading answers out loud" : "Read answers out loud"} disabled={!voiceOn}>
          {speakReplies && voiceOn ? <Volume2 /> : <VolumeX />}
        </Button>
        <Button type="button" unstyled onClick={() => setPanel(panel === "settings" ? null : "settings")} aria-label="Voice settings" disabled={!voiceOn}>
          <SlidersHorizontal />
        </Button>

        <Panel open={panel === "people"} onClose={() => setPanel(null)} title="Talk as someone else">
          <div className="grid grid-cols-2 gap-2">
            {people.map((p) => (
              <a key={p.id} href={`/talk?user=${p.id}`}
                className={cn("flex items-center gap-2 rounded-md border border-usa-base-lighter p-2 text-sm transition-colors hover:bg-usa-base-lightest", p.id === me.id && "border-usa-primary bg-usa-base-lightest")}>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-usa-primary text-[10px] font-semibold text-usa-white">{initialsOf(p.name)}</span>
                <span className="min-w-0">
                  <span className="block truncate font-medium text-usa-ink">{p.name}</span>
                  <span className="block truncate text-[11px] text-usa-base-dark">{roleWord(p.role)}</span>
                </span>
              </a>
            ))}
          </div>
        </Panel>
        <Panel open={panel === "tasks"} onClose={() => setPanel(null)} title="Your tasks" align="right">
          {tasks.length === 0 ? <p className="text-sm text-usa-base-dark">Nothing assigned to you right now.</p> : (
            <ul className="space-y-2">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-center gap-2 rounded-md border border-usa-base-lighter p-2 text-sm">
                  <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full",
                    t.tier === 0 ? "bg-usa-error-lighter text-usa-ink" : t.tier === 1 ? "bg-usa-warning text-usa-ink" : "bg-usa-base-lightest text-usa-base-dark")}>
                    {t.tier === 0 ? <HeartPulse className="size-4" /> : t.tier === 1 ? <Truck className="size-4" /> : <ClipboardList className="size-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-usa-ink">{t.title}</span>
                    {t.detail && <span className="block truncate text-xs text-usa-base-dark">{t.detail}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel open={panel === "settings"} onClose={() => setPanel(null)} title="Voice" align="right">
          <label className="block text-xs font-medium text-usa-base-dark" htmlFor="voice-speed">Voice speed</label>
          <input id="voice-speed" type="range" min={0.7} max={1.2} step={0.05} value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))} className="w-full" />
          <span className="font-mono text-sm font-semibold text-usa-ink">{speed.toFixed(2)}×</span>
        </Panel>
      </div>

      {fresh.length > 0 && (
        <Alert type="warning" slim role="alert" className="mt-3">
          <p className="flex items-center gap-2 text-sm font-semibold"><Siren className="size-4" />Aftershock near you</p>
          {fresh.map((q) => <p key={q.line} className="mt-1 text-xs">{q.line}</p>)}
          <p className="mt-1 text-xs">Leave damaged buildings and stay clear until the shaking stops.</p>
        </Alert>
      )}
      {tasks[0] && turns.length === 0 && (
        <button type="button" onClick={() => setPanel("tasks")}
          className="mt-3 flex items-center gap-2 self-center rounded-full border border-usa-base-lighter bg-usa-white px-3 py-1.5 text-xs shadow-xs transition-colors hover:bg-usa-base-lightest">
          {tasks[0].tier === 0 ? <HeartPulse className="size-3.5 text-usa-error" /> : <ClipboardList className="size-3.5 text-usa-base-dark" />}
          <span className="text-usa-base-dark">Top task</span>
          <span className="max-w-[16rem] truncate font-medium text-usa-ink">{tasks[0].title}</span>
        </button>
      )}

      {/* The conversation, top to bottom. */}
      <div ref={scroller} aria-live="polite" className="min-h-0 flex-1 overflow-y-auto py-6">
        {turns.length === 0 && state !== "listening" && state !== "thinking" ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <p className="text-balance text-xl font-medium text-usa-ink sm:text-2xl">What do you see, or what do you need?</p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGEST.map((s) => (
                <button key={s} type="button" onClick={() => void submit(s)}
                  className="rounded-full border border-usa-base-lighter bg-usa-white px-3 py-1.5 text-xs text-usa-ink transition-colors hover:bg-usa-base-lightest">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {turns.map((t) => (
              <div key={t.id} className={cn("flex flex-col gap-2", t.from === "person" && "items-end")}>
                {t.from === "person" ? (
                  <p className="max-w-[85%] rounded-md rounded-br-sm bg-usa-base-lightest px-4 py-2.5 text-base text-usa-ink">
                    {t.voice && <Mic className="mr-1.5 mb-0.5 inline size-3.5 opacity-60" />}
                    {t.text}
                  </p>
                ) : (
                  <p className="text-lg leading-relaxed text-pretty text-usa-ink sm:text-xl">{t.text}</p>
                )}
                {t.pending && !t.speaking && (
                  <SendCard pending={t.pending} onSend={() => void decide(t.id, t.pending!.id, true)} onDrop={() => void decide(t.id, t.pending!.id, false)} />
                )}
                {t.actions && t.actions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {t.actions.map((a, i) => (
                      <span key={i} title={chipText(a.summary)}
                        className={cn("inline-flex max-w-full items-center gap-1 rounded-full border border-usa-base-lighter bg-usa-white px-2 py-0.5 text-[11px]",
                          !a.ok && "border-usa-error text-usa-error")}>
                        {a.ok ? <CircleCheck className="size-3 shrink-0 text-usa-success" /> : <CircleX className="size-3 shrink-0" />}
                        <span className="font-medium text-usa-ink">{a.ok ? TOOL_WORD[a.tool] ?? "Filed" : "Not filed"}</span>
                        <span className="truncate text-usa-base-dark">{chipText(a.summary)}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {/* What is happening now, as the next line */}
            {state === "thinking" && lastFrom === "person" && (
              <p className="flex items-center gap-1 text-lg text-usa-base-dark"><Dots /></p>
            )}
            {state === "listening" && voice.partial && (
              <p className="max-w-[85%] self-end rounded-md rounded-br-sm bg-usa-base-lightest/70 px-4 py-2.5 text-base text-usa-ink">
                <Mic className="mr-1.5 mb-0.5 inline size-3.5 opacity-60" />{voice.partial}
              </p>
            )}
            {state === "thinking" && lastFrom !== "person" && !answering && (
              <p className="flex items-center gap-1 self-end text-base text-usa-base-dark">Writing down what you said<Dots /></p>
            )}
          </div>
        )}
      </div>

      {/* The button, and typing as a fallback */}
      <div className="flex flex-col items-center pb-[max(1rem,env(safe-area-inset-bottom))]">
        <VoiceOrb state={state} disabled={!voiceOn || state === "thinking"}
          onDown={() => void pressStart()} onUp={() => void pressEnd()} />
        <p className="h-5 text-sm text-usa-base-dark" aria-live="polite">{status}</p>
        <p className="h-4 text-xs text-usa-error">{voice.error ?? ""}</p>
        <div className="mt-1 flex w-full items-center justify-center">
          {typing ? (
            <form onSubmit={(e) => { e.preventDefault(); void submit(typed); }} className="flex w-full max-w-md items-center gap-2">
              <TextInput id="talk-message" name="talk-message" type="text" autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type it…"
                className="h-11 rounded-full px-4" aria-label="Message" />
              <Button type="submit" className="rounded-full" disabled={state === "thinking" || state === "listening" || !typed.trim()} aria-label="Send">
                <SendHorizontal />
              </Button>
              {voiceOn && (
                <Button type="button" unstyled className="rounded-full" onClick={() => setTyping(false)} aria-label="Back to voice">
                  <Mic />
                </Button>
              )}
            </form>
          ) : (
            <Button type="button" unstyled className="rounded-full text-usa-base-dark" onClick={() => setTyping(true)}>
              <Keyboard />Type instead
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}

/** "Send this to the desk?" Shown once the answer has been read. Nothing is sent before the person taps Send. */
function SendCard({ pending, onSend, onDrop }: { pending: NonNullable<Turn["pending"]>; onSend: () => void; onDrop: () => void }) {
  const { state } = pending;
  if (state === "sent") return <p className="flex items-center gap-1.5 text-sm text-usa-base-dark"><CircleCheck className="size-4 text-usa-success" />Sent to the desk.</p>;
  if (state === "dropped") return <p className="flex items-center gap-1.5 text-sm text-usa-base-dark"><CircleX className="size-4" />Not sent.</p>;
  const busy = state === "sending";
  return (
    <div role="group" aria-label="Send this to the desk?"
      className="w-full rounded-md border border-usa-base-lighter bg-usa-white p-3 shadow-xs">
      <p className="text-sm font-medium text-usa-ink">Send this to the desk?</p>
      <ul className="mt-1.5 space-y-0.5 text-sm text-usa-base-dark">
        {pending.items.map((it, i) => <li key={i}>{it.replaceAll("_", " ")}</li>)}
      </ul>
      {state === "error" && <p className="mt-2 text-xs text-usa-error">{pending.error}</p>}
      <div className="mt-3 flex gap-2">
        <Button type="button" className="flex-1" disabled={busy} onClick={onSend}><SendHorizontal />{busy ? "Sending…" : "Send"}</Button>
        <Button type="button" outline className="flex-1" disabled={busy} onClick={onDrop}>Don&apos;t send</Button>
      </div>
    </div>
  );
}

function Dots() {
  return <span className="inline-flex gap-0.5" aria-hidden>{[0, 1, 2].map((i) => <span key={i} className="size-1.5 rounded-full bg-current" />)}</span>;
}
