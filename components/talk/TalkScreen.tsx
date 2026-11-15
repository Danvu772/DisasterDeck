"use client";
// /talk: one person and their own agent, voice first. Hold the button and talk: your wave moves
// while you speak, ElevenLabs writes down what it heard, the agent files it and answers out loud,
// and its wave moves while it speaks. What the agent filed shows as chips under its answer.
// Typing still works. Owner: Role 2.
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUp, CircleCheck, CircleX, ClipboardList, HeartPulse, Loader2, Mic, Siren, Sparkles, Truck, Volume2, VolumeX,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Tier } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExpandablePersonCard } from "@/components/motion/ExpandablePersonCard";
import { IntensitySlider } from "@/components/motion/IntensitySlider";
import { PinnedList, type PinnedItem } from "@/components/motion/PinnedList";
import { TIER_WORD } from "@/components/detail/fields";
import { Waveform } from "./Waveform";
import { useVoice } from "./useVoice";

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

export function TalkScreen({ me, people, tasks, quakes, voiceOn }: {
  me: TalkPerson; people: TalkPerson[]; tasks: TalkTask[]; quakes: TalkQuake[]; voiceOn: boolean;
}) {
  const router = useRouter();
  const voice = useVoice();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [state, setState] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [typed, setTyped] = useState("");
  const [speakReplies, setSpeakReplies] = useState(true);
  const [speed, setSpeed] = useState(1);
  const seq = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns, state]);
  // Aftershocks and the task list come from the server: refresh them every 30 s.
  useEffect(() => { const t = setInterval(() => router.refresh(), 30_000); return () => clearInterval(t); }, [router]);

  const add = (t: Omit<Turn, "id">) => setTurns((xs) => [...xs, { ...t, id: ++seq.current }]);

  async function send(body: { text?: string; audioBase64?: string }) {
    setState("thinking");
    try {
      const res = await fetch(`/api/chat?user=${encodeURIComponent(me.id)}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, speak: speakReplies && voiceOn, speechSpeed: speed }),
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
  async function submit(text: string) {
    const t = text.trim();
    if (!t || state !== "idle") return;
    setTyped("");
    add({ from: "person", text: t });
    await send({ text: t });
  }

  const fresh = quakes.filter((q) => q.minutesAgo <= 30);
  const pinned: PinnedItem[] = tasks.map((t, i) => ({
    id: t.id, title: t.title, note: t.detail, pinned: i === 0,
    icon: t.tier === 0 ? HeartPulse : t.tier === 1 ? Truck : ClipboardList,
    tone: t.tier === 0 ? "act" : t.tier === 1 ? "urgent" : "calm",
  }));
  const busy = state === "thinking" || state === "speaking";
  const status = state === "listening" ? "Listening… let go to send"
    : state === "thinking" ? "Filing it on the desk…"
    : state === "speaking" ? "Your agent is answering"
    : voiceOn ? "Hold to talk" : "Voice is off here. Type instead.";

  return (
    <main className="mx-auto grid max-w-6xl gap-4 p-3 md:h-full md:grid-cols-[320px_1fr] md:p-6">
      {/* Left: who you are, your list, the alert */}
      <aside className="flex min-h-0 flex-col gap-3">
        <ExpandablePersonCard id={me.id} name={me.name} subtitle={roleWord(me.role)}
          badge={<span className="flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success"><span className="size-1.5 rounded-full bg-success" />On shift</span>}>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Talk as someone else</p>
          <div className="grid grid-cols-2 gap-2">
            {people.map((p) => (
              <a key={p.id} href={`/talk?user=${p.id}`}
                className={cn("flex items-center gap-2 rounded-lg border p-2 text-sm transition-colors hover:bg-accent", p.id === me.id && "border-primary bg-secondary")}>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">{initialsOf(p.name)}</span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{roleWord(p.role)}</span>
                </span>
              </a>
            ))}
          </div>
        </ExpandablePersonCard>

        <AnimatePresence>
          {fresh.length > 0 && (
            <motion.section role="alert" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="rounded-xl border border-destructive/40 bg-destructive-soft p-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-destructive"><Siren className="size-4" />Aftershock near you</p>
              {fresh.map((q) => <p key={q.line} className="mt-1 text-xs text-foreground">{q.line}</p>)}
              <p className="mt-1 text-xs text-foreground">Leave damaged buildings and stay clear until the shaking stops.</p>
            </motion.section>
          )}
        </AnimatePresence>

        <PinnedList items={pinned} title="Your tasks" empty="Nothing assigned to you right now." />
        {tasks[0] && (
          <p className="px-1 text-[11px] text-muted-foreground">Top task: {TIER_WORD[tasks[0].tier].toLowerCase()}.</p>
        )}
      </aside>

      {/* Right: the conversation and the voice dock */}
      <section className="flex min-h-[70vh] flex-col overflow-hidden rounded-2xl border bg-card shadow-xs md:min-h-0">
        <header className="flex items-center gap-3 border-b px-4 py-3">
          <span className="flex size-8 items-center justify-center rounded-full bg-info text-info-foreground"><Sparkles className="size-4" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Your agent</p>
            <p className="text-xs text-muted-foreground">Files what you say on the shared desk</p>
          </div>
          <Button variant="ghost" size="icon-sm" aria-pressed={speakReplies} onClick={() => setSpeakReplies((v) => !v)}
            aria-label={speakReplies ? "Stop reading answers out loud" : "Read answers out loud"} disabled={!voiceOn}>
            {speakReplies && voiceOn ? <Volume2 /> : <VolumeX />}
          </Button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4" aria-live="polite">
          {turns.length === 0 && (
            <div className="m-auto flex max-w-sm flex-col items-center gap-3 text-center">
              <p className="text-sm text-muted-foreground">Tell your agent what you see or need.</p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGEST.map((s) => (
                  <button key={s} type="button" onClick={() => void submit(s)} disabled={state !== "idle"}
                    className="rounded-full border bg-background px-3 py-1.5 text-xs transition-colors hover:bg-accent disabled:opacity-50">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          <AnimatePresence initial={false}>
            {turns.map((t) => (
              <motion.div key={t.id} layout initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
                className={cn("flex max-w-[85%] flex-col gap-1.5", t.from === "person" ? "self-end items-end" : "self-start items-start")}>
                <p className={cn("rounded-2xl px-3.5 py-2 text-sm",
                  t.from === "person" ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border bg-info-soft text-foreground")}>
                  {t.voice && <span className="mb-0.5 flex items-center gap-1 text-[11px] opacity-70"><Mic className="size-3" />Heard</span>}
                  {t.text}
                </p>
                {t.actions && t.actions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {t.actions.map((a, i) => (
                      <span key={i} title={chipText(a.summary)}
                        className={cn("inline-flex max-w-full items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[11px]",
                          !a.ok && "border-destructive/40 text-destructive")}>
                        {a.ok ? <CircleCheck className="size-3 shrink-0 text-success" /> : <CircleX className="size-3 shrink-0" />}
                        <span className="font-medium">{a.ok ? TOOL_WORD[a.tool] ?? "Filed" : "Not filed"}</span>
                        <span className="truncate text-muted-foreground">{chipText(a.summary)}</span>
                      </span>
                    ))}
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          {state === "thinking" && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 self-start text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />Your agent is working…
            </motion.p>
          )}
          <div ref={bottom} />
        </div>

        {/* Voice dock */}
        <footer className="border-t bg-background/60 p-4">
          <div className="rounded-xl border bg-card px-3 pt-2">
            <Waveform
              analyser={state === "speaking" ? voice.agentAnalyser : voice.micAnalyser}
              tone={state === "speaking" ? "agent" : "person"}
              label={state === "speaking" ? "Your agent is speaking" : state === "listening" ? "Listening to you" : "Quiet"}
            />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <motion.button
              type="button"
              disabled={!voiceOn || busy}
              whileTap={{ scale: 0.94 }}
              animate={state === "listening" ? { scale: 1.06 } : { scale: 1 }}
              onPointerDown={(e) => { e.preventDefault(); void pressStart(); }}
              onPointerUp={() => void pressEnd()}
              onPointerLeave={() => void pressEnd()}
              onContextMenu={(e) => e.preventDefault()}
              aria-label="Hold to talk"
              className={cn("relative flex size-14 shrink-0 select-none items-center justify-center rounded-full shadow-md transition-colors disabled:opacity-40",
                state === "listening" ? "bg-destructive text-destructive-foreground marker-pulse" : "bg-primary text-primary-foreground hover:bg-primary/90")}
            >
              {busy ? <Loader2 className="size-6 animate-spin" /> : <Mic className="size-6" />}
            </motion.button>
            <form onSubmit={(e) => { e.preventDefault(); void submit(typed); }} className="flex min-w-0 flex-1 items-center gap-2">
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Or type it…" className="h-10" aria-label="Message" />
              <Button type="submit" size="icon-lg" disabled={state !== "idle" || !typed.trim()} aria-label="Send">
                <ArrowUp />
              </Button>
            </form>
          </div>
          <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">{status}</p>
          {voice.error && <p className="mt-1 text-xs text-destructive">{voice.error}</p>}
          {voiceOn && speakReplies && (
            <IntensitySlider className="mt-3" label="Voice speed" value={speed} min={0.7} max={1.2} step={0.05}
              unit="×" format={(v) => v.toFixed(2)} onChange={setSpeed} />
          )}
        </footer>
      </section>
    </main>
  );
}
