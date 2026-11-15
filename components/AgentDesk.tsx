"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import {
  Activity, ArrowUp, Car, ClipboardList, Inbox, Package, ShieldCheck, Sparkles, Truck, type LucideIcon,
} from "lucide-react";
import type { Event, Message, User } from "@/lib/types";
import type { makeBoard } from "@/fixtures/board";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EventRow } from "./EventRow";
import { EventReport } from "./event/EventReport";
import { TaskCard } from "./TaskCard";
import { getCoords, sendTaskEvent, taskEventBody, type ProblemKind, type TaskAction } from "./taskEvents";
import { pickMetrics } from "./metrics/useMetrics";
import { VizSpace, type Ask } from "./agent/VizSpace";
import { stubReply } from "./stubAgent";
import { chatErrorText } from "./chatError";
import { cursorOf, feedUrl, mergeServer, shownEvents } from "./agentFeed";
import { YourNeeds } from "./YourNeeds";
import { ExpandablePersonCard } from "./motion/ExpandablePersonCard";
import { usePolled } from "./map/usePolled";
import { isRealTask, needsFor, nextLocalStatus, viewTask, type LocalTask } from "./taskState";
import { statusWord } from "./detail/fields";
import { rankOpen } from "@/lib/rules/top";

type FeedEvent = Event & { _id: string };
type DeskBoard = ReturnType<typeof makeBoard>;

const ROLE: Record<User["role"], string> = {
  volunteer: "Volunteer", field: "Field team", supplier: "Supplier", shelter: "Shelter",
  coordinator: "Coordinator", public: "Citizen",
};
const TRUST: Record<User["trust"], string> = { official: "Official", vetted: "Vetted", public: "Public" };
const SUGGESTIONS = ["What should I do next?", "Any shelters with free beds?", "Which roads are closed?"];

// "antakya-merkez" → "Antakya Merkez", "first_aid" → "first aid".
const words = (s: string) => s.replace(/[-_]+/g, " ").trim();
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const place = (s: string) => words(s).split(" ").map(cap).join(" ");

function SectionTitle({ icon: Icon, title, extra }: { icon: LucideIcon; title: string; extra?: ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold">
      <Icon className="size-4 text-muted-foreground" />
      {title}
      {extra}
    </h2>
  );
}

function AgentAvatar({ size = "sm" }: { size?: "sm" | "md" }) {
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-full bg-info text-info-foreground",
      size === "md" ? "size-9" : "size-7")}>
      <Sparkles className={size === "md" ? "size-4" : "size-3.5"} />
    </span>
  );
}

// One chat line. The agent speaks in the info colour on the left, the person in primary on the right.
// The hidden "Agent:" keeps the line readable to screen readers (and to the e2e count).
function Bubble({ m }: { m: Pick<Message, "from" | "text"> }) {
  if (m.from === "agent") {
    return (
      <div className="flex max-w-[88%] items-end gap-2 self-start">
        <AgentAvatar />
        <p className="whitespace-pre-line rounded-2xl rounded-bl-md bg-info-soft px-3.5 py-2 text-sm text-foreground">
          <span className="sr-only">Agent:</span> {m.text}
        </p>
      </div>
    );
  }
  return (
    <p className="max-w-[80%] self-end whitespace-pre-line rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm text-primary-foreground">
      <span className="sr-only">You:</span> {m.text}
    </p>
  );
}

function Typing() {
  return (
    <div role="status" className="flex items-end gap-2 self-start">
      <AgentAvatar />
      <span className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-info-soft px-3.5 py-3">
        <span className="sr-only">Your agent is reading the desk</span>
        {[0, 1, 2].map((i) => (
          <motion.span key={i} className="size-1.5 rounded-full bg-info"
            animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15 }} />
        ))}
      </span>
    </div>
  );
}

function Context({ user }: { user: User }) {
  const p = user.profile ?? {};
  const rows: [string, ReactNode][] = [];
  if (p.skills?.length) rows.push(["Skills", (
    <span key="s" className="flex flex-wrap gap-1">{p.skills.map((s) => <Badge key={s} variant="secondary">{cap(words(s))}</Badge>)}</span>
  )]);
  if (p.vehicle && p.vehicle !== "none") {
    const V = p.vehicle === "car" ? Car : Truck;
    rows.push(["Vehicle", <span key="v" className="inline-flex items-center gap-1.5"><V className="size-4 text-muted-foreground" />{cap(p.vehicle)}</span>]);
  }
  if (p.stock && Object.keys(p.stock).length) {
    rows.push(["Stock", Object.entries(p.stock).map(([k, v]) => `${v} ${words(k)}`).join(", ")]);
  }
  if (p.notes) rows.push(["Notes", p.notes]);
  if (!rows.length) return <p className="text-muted-foreground">Nothing on file yet.</p>;
  return (
    <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-3">
      {rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-xs text-muted-foreground">{k}</dt><dd>{v}</dd></div>)}
    </dl>
  );
}

// Left: this person's own task and needs. Right: their agent. Below: everything entering the desk.
export function AgentDesk(props: {
  user: User; users: User[]; events: FeedEvent[]; messages: Message[]; initial: DeskBoard; initialLive?: boolean;
}) {
  const { user } = props;
  const { data: board, live, now } = usePolled<DeskBoard>("/api/board", props.initial, 1000, props.initialLive);
  // Server events (null until the first answer), the lines the buttons add, and fixtures as the start.
  const [server, setServer] = useState<FeedEvent[] | null>(null);
  const [locals, setLocals] = useState<FeedEvent[]>([]);
  const polled = usePolled<FeedEvent[] | null>(feedUrl(cursorOf(server)), null, 2000);
  const [seen, setSeen] = useState<FeedEvent[] | null>(null);
  if (polled.data !== seen) {
    setSeen(polled.data);
    if (polled.data) setServer(mergeServer(server, polled.data));
  }
  const events = shownEvents(server, locals, props.events);
  const [messages, setMessages] = useState(props.messages);
  const [text, setText] = useState("");
  const [stub, setStub] = useState(false);
  // One entry per prompt for the chart space (t42). It opens on every send, the reply stays in the chat.
  const [asks, setAsks] = useState<Ask[]>([]);
  const [vizOpen, setVizOpen] = useState(false);
  const closeViz = useCallback(() => setVizOpen(false), []);
  const chatSeq = useRef(0);
  // Per task id: what the card shows until the board catches up, and the words under the buttons.
  const [local, setLocal] = useState<Record<string, LocalTask>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [demoLines, setDemoLines] = useState<Set<string>>(new Set());
  const inFlight = useRef(new Set<string>());
  const lineSeq = useRef(0);
  // The top task is decided from the board as it is now (lib/rules/top.ts), not the priority the task was made with.
  const views = rankOpen(board.tasks, board, user._id, now).map(({ task: t }) => ({ raw: t, ...viewTask(t, local[t._id]) }));
  const open = views.filter((v) => v.task.open);
  const top = open[0];
  const needs = needsFor(board.needs, user._id);
  const closed = Object.entries(local).filter(([, l]) => l.status === "done" || l.status === "declined");
  const feedRef = useRef<HTMLElement>(null);
  const feedScroll = useRef(0);
  const chatRef = useRef<HTMLDivElement>(null);
  const eventId = useSearchParams().get("event");
  const report = eventId ? events.find((e) => e._id === eventId) : undefined;
  const nameOf = (id: string) => props.users.find((u) => u._id === id)?.name ?? id;
  const thinking = asks.at(-1)?.ids === null;
  const offline = !live || server === null;

  // ?event= is the one source of truth. replaceState keeps ?user= and the history stack, like the board's ?open=.
  const setEventParam = useCallback((id: string | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("event", id); else url.searchParams.delete("event");
    window.history.replaceState(null, "", url);
  }, []);
  const openReport = (id: string) => { feedScroll.current = feedRef.current?.scrollTop ?? 0; setEventParam(id); };
  const closeReport = useCallback(() => setEventParam(null), [setEventParam]);

  useEffect(() => {
    if (!report) return;
    const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape") closeReport(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [report, closeReport]);

  useLayoutEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = report ? 0 : feedScroll.current;
  }, [report]);

  // The newest line stays in view.
  useEffect(() => {
    const el = chatRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, thinking]);

  function localEvent(e: Omit<FeedEvent, "_id" | "ts" | "deskId" | "lane" | "status" | "actor">, demo: boolean) {
    const id = `local-${lineSeq.current++}`;
    setLocals((xs) => [{ ...e, _id: id, ts: new Date(), deskId: user.deskId,
      lane: 0, status: "pending", actor: user._id }, ...xs]);
    if (demo) setDemoLines((d) => new Set(d).add(id));
    return id;
  }

  async function send(question?: string) {
    const said = (question ?? text).trim();
    if (!said) return;
    if (question === undefined) setText("");
    setMessages((m) => [...m, { _id: `u${m.length}`, userId: user._id, from: "user", text: said, ts: new Date() }]);
    const id = `a-${chatSeq.current++}`;
    setAsks((xs) => [...xs, { id, question: said, at: Date.now(), ids: null }]);
    setVizOpen(true);
    let reply: string;
    let body: unknown = null;
    try {
      const r = await fetch(`/api/chat?user=${user._id}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: said }),
      });
      body = await r.json().catch(() => null);
      const got = (body as { reply?: unknown } | null)?.reply;
      reply = r.ok && typeof got === "string" ? got : chatErrorText(r.ok ? 502 : r.status, body);
      setStub(false);
    } catch {
      // Only an unreachable route gets the stub. A 502 is shown as what it is.
      reply = stubReply(user, top?.task, said);
      setStub(true);
    }
    const ids = pickMetrics(said, body);
    setAsks((xs) => xs.map((a) => (a.id === id ? { ...a, ids } : a)));
    setMessages((m) => [...m, { _id: id, userId: user._id, from: "agent", text: reply, ts: new Date() }]);
  }

  const note = (id: string, text: string) => setNotes((n) => ({ ...n, [id]: text }));

  // One press is one feed line. A real task locks the card until the desk answers, a demo task
  // (id not on the live board) applies at once and posts nothing.
  async function onAction(a: TaskAction, kind?: ProblemKind) {
    if (!top) return;
    const id = top.raw._id;
    if (inFlight.current.has(id)) return;
    const demo = !isRealTask(id, live ? board : null);
    const prev = local[id];
    setLocal((l) => ({ ...l, [id]: { status: nextLocalStatus(a), base: top.raw.status, title: top.raw.title, pending: !demo, demo } }));
    if (demo) {
      note(id, "");
      localEvent(taskEventBody(id, a, kind), true);
      return;
    }
    inFlight.current.add(id);
    note(id, "Sending");
    const coords = a === "problem" ? await getCoords() : undefined;
    const body = taskEventBody(id, a, kind, coords);
    const line = localEvent(body, false);
    const result = await sendTaskEvent(user._id, body);
    inFlight.current.delete(id);
    if (result === "Sent") {
      setLocal((l) => ({ ...l, [id]: { ...l[id], pending: false } }));
    } else {
      setLocal((l) => { const rest = { ...l }; delete rest[id]; return prev ? { ...rest, [id]: prev } : rest; });
      setLocals((xs) => xs.filter((x) => x._id !== line));
    }
    note(id, result);
  }

  const card = "rounded-xl border bg-card shadow-xs";
  return (
    <MotionConfig reducedMotion="user">
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section aria-label="Your tasks" className="flex min-w-0 flex-col gap-5">
          <ExpandablePersonCard id={user._id} name={user.name} subtitle={`${ROLE[user.role]} · ${place(user.region)}`}
            badge={<Badge variant="secondary"><ShieldCheck />{TRUST[user.trust]}</Badge>}>
            <Context user={user} />
          </ExpandablePersonCard>

          <div className="flex flex-col gap-2">
            <SectionTitle icon={ClipboardList} title="Next task"
              extra={open.length > 1 && <Badge variant="secondary" className="font-mono">+{open.length - 1}</Badge>} />
            {top ? <TaskCard task={top.task} now={now} onAction={onAction} notice={notes[top.raw._id]}
              busy={local[top.raw._id]?.pending} reported={top.reported} demo={local[top.raw._id]?.demo}
              assigneeName={props.users.find((u) => u._id === top.task.assignee)?.name} />
                 : (
                   <div className="flex items-center gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                     <Inbox className="size-5" />Nothing assigned to you.
                   </div>
                 )}
            {closed.length > 0 && (
              <ul className="flex flex-col gap-1.5 text-sm">
                {closed.map(([id, l]) => (
                  <li key={id} className="flex flex-wrap items-center gap-2 rounded-lg bg-secondary px-3 py-2">
                    <Badge variant="outline">{statusWord(l.status)}</Badge>
                    <span className="min-w-0 flex-1 truncate">{l.title}</span>
                    {l.demo && <Badge variant="outline">Demo</Badge>}
                    {notes[id] && <span className="text-xs text-muted-foreground">{notes[id]}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <SectionTitle icon={Package} title="Your needs"
              extra={needs.length > 0 && <Badge variant="secondary" className="font-mono">{needs.length}</Badge>} />
            <YourNeeds needs={needs} now={now} />
          </div>
        </section>

        <div className="flex min-w-0 flex-col">
          <section aria-label="Your agent" className={cn(card, "flex h-[32rem] min-w-0 flex-1 flex-col overflow-hidden lg:h-[38rem]")}>
            <header className="flex items-center gap-3 border-b px-4 py-3">
              <AgentAvatar size="md" />
              <h2 className="min-w-0 flex-1 text-sm font-semibold">Your agent</h2>
              {offline
                ? <Badge variant="outline" title="The desk is not answering, so this shows demo data">Demo data</Badge>
                : <Badge variant="outline"><span className="size-1.5 rounded-full bg-success" />Live</Badge>}
            </header>
            <div ref={chatRef} className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
              {messages.length === 0 && !thinking && (
                <div className="m-auto flex flex-col items-center gap-2 py-6 text-center">
                  <AgentAvatar size="md" />
                  <p className="text-sm font-medium">Ask about your task or the desk</p>
                </div>
              )}
              <AnimatePresence initial={false}>
                {messages.map((m) => (
                  <motion.div key={m._id} className="flex flex-col"
                    initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}>
                    <Bubble m={m} />
                  </motion.div>
                ))}
              </AnimatePresence>
              {thinking && <Typing />}
            </div>
            <form className="flex flex-col gap-2 border-t p-3" onSubmit={(e) => { e.preventDefault(); send(); }}>
              {asks.length === 0 && (
                <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" onClick={() => send(s)}
                      className="h-7 shrink-0 rounded-full border bg-background px-3 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 rounded-xl border bg-background py-1.5 pr-1.5 pl-3 transition-shadow focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
                <label htmlFor="agent-msg" className="sr-only">Message your agent</label>
                <input id="agent-msg" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask your agent"
                  autoComplete="off" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
                <Button type="submit" size="sm">Send<ArrowUp /></Button>
              </div>
              {stub && <p className="px-1 text-xs text-muted-foreground">Agent offline, this is a stub reply.</p>}
            </form>
          </section>
        </div>
      </div>
      {/* Full page width under both columns, so the charts use the space the left column leaves. */}
      <VizSpace asks={asks} open={vizOpen} onClose={closeViz} events={server ? events : undefined} user={user._id} />

      <section ref={feedRef} className={cn(card, "max-h-[28rem] min-h-0 overflow-y-auto")}>
        {report ? (
          <div className="p-4">
            <EventReport e={report} now={now} actorName={nameOf(report.actor)} onBack={closeReport}
              demo={demoLines.has(report._id)} />
          </div>
        ) : (
          <div className="px-4 pt-3 pb-1">
            <h2 className="flex items-center gap-2 pb-2 text-sm font-semibold">
              <Activity className="size-4 text-muted-foreground" />Desk feed
            </h2>
            <ul>{events.map((e) => <EventRow key={e._id} e={e} now={now} actorName={nameOf(e.actor)}
              demo={demoLines.has(e._id)} onOpen={() => openReport(e._id)} />)}</ul>
          </div>
        )}
      </section>
    </div>
    </MotionConfig>
  );
}
