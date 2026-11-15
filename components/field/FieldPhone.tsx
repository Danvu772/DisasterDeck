"use client";
// The field team's phone. One task, big buttons, works with one thumb and a bad network.
// Polls GET /api/board, falls back to the demo board and says so.
import { useState } from "react";
import {
  Ambulance, AudioLines, Car, ChevronDown, ChevronRight, CircleCheck, CircleAlert, Clock, CloudOff, HandHelping, LifeBuoy,
  MapPin, MapPinOff, Megaphone, Mic, Navigation, Phone, Sparkles, TriangleAlert, Truck, Users, type LucideIcon,
} from "lucide-react";
import type { IncidentKind, LatLng, Task } from "@/lib/types";
import { usePolled } from "@/components/map/usePolled";
import { History } from "@/components/History";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { statusWord, TIER_WORD } from "@/components/detail/fields";
import { tierBadge, tierBar } from "@/components/encode";
import { cn } from "@/lib/utils";
import { CaseNo } from "@/components/ScoreBreakdown";
import { Input } from "@/components/ui/input";
import { openTasksFor, type FieldBoard, type FieldTask } from "./pickTask";
import { useOutbox, type FieldEvent } from "./useOutbox";
import { useHoldToTalk } from "./useHoldToTalk";
import { useVoiceAgent, type AgentState } from "./useVoiceAgent";
import type { AgentAction } from "./voiceClient";

// What the voice agent is doing, in words. "off" shows nothing.
const AGENT_STATE: Record<AgentState, string> = {
  off: "", starting: "Starting the microphone", listening: "Listening", hearing: "Hearing you",
  thinking: "Your agent is working", speaking: "Your agent is speaking", waiting: "Waiting a minute",
};

// What the agent did with the last message: the tools it ran, done or not.
function Actions({ list }: { list: AgentAction[] }) {
  if (!list.length) return null;
  return (
    <ul className="space-y-1.5 text-sm">
      {list.map((a, i) => (
        <li key={i} className="flex items-start gap-2">
          {a.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />}
          <span>{`${a.ok ? "Done" : "Not done"}: ${a.summary}`}</span>
        </li>
      ))}
    </ul>
  );
}

// The person's words on the right, the agent's answer on the left (same bubbles as /agent and /talk).
function Said({ text }: { text: string }) {
  return (
    <p className="ml-auto w-fit max-w-[85%] whitespace-pre-line rounded-2xl rounded-br-md bg-primary px-4 py-3 text-base text-primary-foreground">
      <span className="sr-only">You:</span> {text}
    </p>
  );
}
function Reply({ text }: { text: string }) {
  return (
    <p className="whitespace-pre-line rounded-2xl rounded-bl-md bg-info-soft px-4 py-3 text-base">
      <span className="sr-only">Agent:</span> {text}
    </p>
  );
}

type Panel = "eta" | "done" | "problem" | null;

const ETAS = [10, 20, 30, 60];
const PROBLEMS: { kind: IncidentKind; label: string; text: string; icon: LucideIcon }[] = [
  { kind: "vehicle_breakdown", label: "Vehicle", text: "Our vehicle broke down, we cannot continue.", icon: Car },
  { kind: "road_blocked", label: "Road blocked", text: "The road is blocked, we cannot get through.", icon: TriangleAlert },
  { kind: "cannot_find", label: "Can't find it", text: "We cannot find the address.", icon: MapPinOff },
  { kind: "other", label: "Other", text: "We have a problem and cannot continue.", icon: CircleAlert },
];

const KIND: Record<Task["type"], { word: string; icon: LucideIcon }> = {
  rescue: { word: "Rescue", icon: LifeBuoy },
  deliver: { word: "Delivery", icon: Truck },
  call: { word: "Call", icon: Phone },
  notify: { word: "Notify", icon: Megaphone },
  assist: { word: "Assist", icon: HandHelping },
  evacuate: { word: "Evacuate", icon: Ambulance },
};

// The three steps of a task, in order. The current one is the one big primary button.
const STEPS = [
  { label: "On our way", icon: Navigation },
  { label: "Arrived", icon: MapPin },
  { label: "Done", icon: CircleCheck },
] as const;

const big = "h-14 w-full rounded-xl text-lg [&_svg:not([class*='size-'])]:size-5";
const mid = "h-12 w-full rounded-xl text-base [&_svg:not([class*='size-'])]:size-5";

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

function timeLeft(min: number): string {
  return min < 0 ? `${-min} min late` : `${min} min left`;
}

function OtherRow({ o, now, onPick }: { o: FieldTask; now: number; onPick: (id: string) => void }) {
  const t = o.task;
  const min = Math.round((new Date(t.deadline).getTime() - now) / 60000);
  const late = min < 0;
  const Icon = KIND[t.type]?.icon ?? LifeBuoy;
  return (
    <button onClick={() => onPick(t._id)}
      className="flex min-h-16 w-full items-center gap-3 overflow-hidden rounded-xl border bg-card pr-3 text-left shadow-xs transition-colors hover:bg-accent">
      <span className={`w-1.5 self-stretch ${tierBar(t.tier, late)}`} />
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1 py-3">
        <span className="block break-words text-base font-medium leading-tight">{t.title}</span>
        <span className={cn("mt-1 flex items-center gap-1 text-sm", late ? "font-medium text-destructive" : "text-muted-foreground")}>
          <Clock className="size-3.5" />{timeLeft(min)}
        </span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
    </button>
  );
}

export function FieldPhone({ user, wanted, initial, initialLive = false }: {
  user: string; wanted?: string; initial: FieldBoard; initialLive?: boolean;
}) {
  const { data, live, now } = usePolled<FieldBoard>("/api/board", initial, 1000, initialLive);
  const { send, waiting } = useOutbox(user);
  const talk = useHoldToTalk(user);
  const agent = useVoiceAgent(user);
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

  // The three step buttons: done steps quiet with a check, the current one big and primary.
  function stepButton(i: number, t: Task) {
    const s = STEPS[i];
    const current = step === i;
    const onClick = i === 0 ? () => setPanel("eta")
      : i === 1 ? () => report({ type: "answer", payload: { taskId: t._id, result: "accepted", etaMinutes: 0, progress: "arrived" } }, "Arrived", 2)
      : () => setPanel("done");
    const Icon = step > i ? CircleCheck : s.icon;
    return (
      <Button key={s.label} variant={current ? "default" : step > i ? "secondary" : "outline"} disabled={busy}
        className={cn(current ? big : mid, step > i && "text-muted-foreground")} onClick={onClick}>
        <Icon />{s.label}
      </Button>
    );
  }

  const Kind = task ? KIND[task.type] ?? KIND.rescue : KIND.rescue;
  const failed = said?.startsWith("Not sent");

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4 pb-10">
      <header className="flex items-center justify-between gap-3 pt-1">
        <h1 className="text-xl font-semibold tracking-tight">{task ? "Your next task" : "No task right now"}</h1>
        {live
          ? <Badge variant="outline"><span className="size-1.5 rounded-full bg-success" />Live</Badge>
          : <Badge variant="outline" title="The desk is not answering, so this shows demo data">Demo data</Badge>}
      </header>

      {waiting > 0 && (
        <div className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-xs">
          <CloudOff className="size-5 shrink-0 text-muted-foreground" />
          <p className="text-base font-medium">
            {waiting} {waiting === 1 ? "report" : "reports"} waiting to send
            <span className="block text-sm font-normal text-muted-foreground">Retrying every 10 s</span>
          </p>
        </div>
      )}
      {said && (
        <p role="status" className="flex items-start gap-2 rounded-xl border bg-card p-3 text-base shadow-xs">
          {failed ? <CircleAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
            : <CircleCheck className="mt-0.5 size-5 shrink-0" />}
          {said}
        </p>
      )}
      {closed && <p className="text-sm text-muted-foreground">That task is closed. Showing your next one.</p>}

      {!current || !task ? (
        <section className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center">
          <CircleCheck className="size-8 text-muted-foreground" />
          <p className="text-base text-muted-foreground">The desk sends your next task here.</p>
        </section>
      ) : (
        <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
          <div className={`h-1.5 ${tierBar(task.tier, overdue)}`} />
          <div className="flex flex-col gap-4 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium ${tierBadge(task.tier, overdue)}`}>
                {TIER_WORD[task.tier]}
              </span>
              <Badge variant="outline" className="h-6"><Kind.icon />{Kind.word}</Badge>
              <span className={cn("ml-auto flex items-center gap-1 text-sm font-medium",
                overdue ? "text-destructive" : "text-muted-foreground")}>
                <Clock className="size-4" /><span className="font-mono">{timeLeft(minutesLeft)}</span>
              </span>
            </div>

            <div>
              <h2 className="break-words text-2xl font-semibold leading-tight tracking-tight">{current.place}</h2>
              <p className="mt-1.5 flex items-center gap-1.5 text-base text-muted-foreground">
                <Users className="size-4" />{current.people}
              </p>
            </div>
            <p className="break-words text-base">
              {caseNo !== undefined && <span className="mr-2 text-muted-foreground"><CaseNo kind={task.recordType} no={caseNo} /></span>}
              {task.title}
            </p>

            <button type="button" aria-expanded={details} onClick={() => setDetails(!details)}
              className="-mx-1 flex min-h-11 items-center gap-1 rounded-md px-1 text-sm font-medium text-muted-foreground hover:text-foreground">
              <ChevronDown className={cn("size-4 transition-transform", details && "rotate-180")} />
              {details ? "Hide details" : "Details"}
            </button>
            {details && (
              <div className="-mt-2 space-y-3 rounded-lg bg-secondary p-3 text-base">
                {task.detail && <p>{task.detail}</p>}
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant="outline" className="bg-background">{statusWord(task.status)}</Badge>
                  <span className="text-muted-foreground">{task.risk === "high" ? "High risk" : "Low risk"}</span>
                </p>
                {task.history.length > 0 && <History entries={task.history} now={now} />}
              </div>
            )}

            {panel === "eta" && (
              <section className="space-y-3 border-t pt-4">
                <h2 className="text-lg font-semibold">How long until you get there?</h2>
                <div className="grid grid-cols-2 gap-3">
                  {ETAS.map((m) => (
                    <Button key={m} variant="outline" className={big} disabled={busy}
                      onClick={() => report({ type: "answer", payload: { taskId: task._id, result: "accepted", etaMinutes: m, progress: "en_route" } },
                        `On our way, ${m} min`, 1)}>
                      <span className="font-mono">{m}</span> min
                    </Button>
                  ))}
                </div>
                <Button variant="ghost" className={mid} onClick={() => setPanel(null)}>Cancel</Button>
              </section>
            )}

            {panel === "done" && (
              <section className="space-y-3 border-t pt-4">
                <label className="block text-lg font-semibold" htmlFor="done-note">What happened? <span className="text-sm font-normal text-muted-foreground">Optional</span></label>
                <textarea id="done-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)}
                  className="w-full rounded-xl border border-input bg-background p-3 text-lg outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
                <Button className={big} disabled={busy}
                  onClick={() => report({ type: "answer", payload: { taskId: task._id, result: "done", note: note.trim() || "Done" } },
                    "Done", 3)}>
                  <CircleCheck />Send done
                </Button>
                <Button variant="ghost" className={mid} onClick={() => setPanel(null)}>Cancel</Button>
              </section>
            )}

            {panel === "problem" && (
              <section className="space-y-3 border-t pt-4">
                <h2 className="text-lg font-semibold">What is the problem?</h2>
                <div className="grid grid-cols-2 gap-3">
                  {PROBLEMS.map((p) => (
                    <Button key={p.kind} variant="outline" disabled={busy} onClick={() => problem(p)}
                      className="h-20 flex-col gap-1.5 rounded-xl text-base [&_svg:not([class*='size-'])]:size-5">
                      <p.icon />{p.label}
                    </Button>
                  ))}
                </div>
                <Button variant="ghost" className={mid} onClick={() => setPanel(null)}>Cancel</Button>
              </section>
            )}

            {panel === null && (
              <section className="flex flex-col gap-2 border-t pt-4">
                {STEPS.map((_, i) => stepButton(i, task))}
                <Button variant="destructive" className={cn(mid, "mt-2")} disabled={busy} onClick={() => setPanel("problem")}>
                  <TriangleAlert />Problem
                </Button>
              </section>
            )}
          </div>
        </section>
      )}

      {others.length > 0 && (
        <section className="space-y-2 pt-2">
          <h2 className="text-sm font-semibold">Your other tasks ({others.length})</h2>
          {others.map((o) => <OtherRow key={o.task._id} o={o} now={now} onPick={choose} />)}
        </section>
      )}

      <section className="space-y-3 pt-2">
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex size-6 items-center justify-center rounded-full bg-info text-info-foreground"><Sparkles className="size-3.5" /></span>
            Your agent
          </h2>
          <span className="ml-auto text-xs text-muted-foreground">
            {talk.engine === null ? "Checking voice…" : talk.engine === "elevenlabs" ? "Voice: ElevenLabs." : "Voice: this phone's own speech."}
          </span>
        </div>

        <Button type="button" variant={agent.on ? "default" : "outline"} aria-pressed={agent.on} onClick={agent.toggle}
          className={cn(mid, agent.on && "ring-4 ring-ring/40")}
          disabled={talk.engine !== "elevenlabs" || talk.state === "recording" || talk.state === "starting" || talk.state === "sending"}>
          <AudioLines />
          {agent.on ? "Voice agent on, tap to stop" : "Start voice agent (hands-free)"}
        </Button>
        {agent.on && AGENT_STATE[agent.state] && (
          <p className="flex items-center gap-2 text-base font-medium">
            <span className="size-2 animate-pulse rounded-full bg-info" />{AGENT_STATE[agent.state]}
          </p>
        )}
        {agent.note && <p aria-live="polite" className="text-sm text-muted-foreground">{agent.note}</p>}
        {agent.last && (
          <div className="space-y-2">
            {agent.last.said && <Said text={agent.last.said} />}
            <Reply text={agent.last.reply} />
            <Actions list={agent.last.actions} />
          </div>
        )}

        <Button
          className={cn("h-20 w-full touch-none select-none rounded-2xl text-lg [-webkit-touch-callout:none] [&_svg:not([class*='size-'])]:size-6",
            talk.state === "recording" && "animate-pulse ring-4 ring-ring/50")}
          disabled={talk.engine === null || talk.state === "unsupported" || talk.state === "sending" || agent.on}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); talk.start(); }}
          onPointerUp={talk.stop}
          onPointerCancel={talk.stop}
          onKeyDown={(e) => {
            if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); talk.start(); }
          }}
          onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") talk.stop(); }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <Mic />
          {talk.state === "recording" ? "Recording, let go to send"
            : talk.state === "starting" ? "Starting the microphone"
            : talk.state === "sending" ? "Sending"
            : "Hold to talk"}
        </Button>
        {talk.state === "unsupported" && (
          <p className="text-sm text-muted-foreground">The microphone needs an HTTPS page. Type to your agent instead.</p>
        )}
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); talk.sendText(typed); setTyped(""); }}>
          <label htmlFor="agent-text" className="sr-only">Tell your agent</label>
          <Input id="agent-text" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Or type to your agent"
            className="h-12 min-w-0 flex-1 text-base" />
          <Button type="submit" variant="outline" className="h-12 px-4"
            disabled={!typed.trim() || talk.state === "sending" || talk.state === "recording"}>
            Send
          </Button>
        </form>
        <div aria-live="polite" className="space-y-2">
          {talk.said && <Said text={talk.said} />}
          {talk.state === "sending" && <p className="text-sm text-muted-foreground">Your agent is answering…</p>}
          {talk.error && <p className="text-sm">{talk.error}</p>}
          {talk.reply && <Reply text={talk.reply} />}
          <Actions list={talk.actions} />
        </div>
        {talk.speaking && <Button variant="ghost" className="h-11" onClick={talk.hush}>Stop reading aloud</Button>}
      </section>
    </main>
  );
}
