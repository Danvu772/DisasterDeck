"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Event, Message, User } from "@/lib/types";
import type { makeBoard } from "@/fixtures/board";
import { EventRow } from "./EventRow";
import { EventReport } from "./event/EventReport";
import { TaskCard } from "./TaskCard";
import { getCoords, sendTaskEvent, taskEventBody, type ProblemKind, type TaskAction } from "./taskEvents";
import { ChatLine } from "./ChatLine";
import { pickMetrics } from "./metrics/useMetrics";
import { VizSpace, type Ask } from "./agent/VizSpace";
import { stubReply } from "./stubAgent";
import { chatErrorText } from "./chatError";
import { cursorOf, feedUrl, mergeServer, shownEvents } from "./agentFeed";
import { YourNeeds } from "./YourNeeds";
import { usePolled } from "./map/usePolled";
import { isRealTask, needsFor, nextLocalStatus, viewTask, type LocalTask } from "./taskState";
import { rankOpen } from "@/lib/rules/top";
import { button, statusTag, statusText } from "./encode";

type FeedEvent = Event & { _id: string };
type DeskBoard = ReturnType<typeof makeBoard>;

const demoTag = "rounded-tag border border-line px-1.5 text-xs font-normal text-muted";

// Left: everything entering the desk, from anyone. Right: this person and their own agent.
export function AgentDesk(props: {
  user: User; users: User[]; events: FeedEvent[]; messages: Message[]; initial: DeskBoard;
}) {
  const { user } = props;
  const { data: board, live, now } = usePolled<DeskBoard>("/api/board", props.initial);
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
  const eventId = useSearchParams().get("event");
  const report = eventId ? events.find((e) => e._id === eventId) : undefined;
  const nameOf = (id: string) => props.users.find((u) => u._id === id)?.name ?? id;

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

  function localEvent(e: Omit<FeedEvent, "_id" | "ts" | "deskId" | "lane" | "status" | "actor">, demo: boolean) {
    const id = `local-${lineSeq.current++}`;
    setLocals((xs) => [{ ...e, _id: id, ts: new Date(), deskId: user.deskId,
      lane: 0, status: "pending", actor: user._id }, ...xs]);
    if (demo) setDemoLines((d) => new Set(d).add(id));
    return id;
  }

  async function send() {
    const said = text.trim();
    if (!said) return;
    setText("");
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

  const card = "rounded-card border border-line bg-card";
  return (
    <div className="flex flex-col gap-5">
      {!live && <p className="text-sm text-muted">Demo data, the board API is not answering.</p>}
      {server === null && <p className="text-sm text-muted">Demo data, the events API is not answering.</p>}
      <div className={`grid gap-5 lg:transition-[grid-template-columns] lg:duration-250 lg:ease-out motion-reduce:transition-none ${
        vizOpen ? "lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]" : "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"}`}>
        <section aria-label="Your tasks" className="flex min-w-0 flex-col gap-4">
          <details className={`${card} p-3 text-sm`}>
            <summary className="cursor-pointer">
              <span className="font-bold">{user.name}</span>
              <span className="text-muted">, {user.role}, {user.trust}, {user.region}</span>
              <span className="ml-2 text-primary underline">Context file</span>
            </summary>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              {user.profile?.skills && <><dt className="text-muted">skills</dt><dd>{user.profile.skills.join(", ")}</dd></>}
              {user.profile?.vehicle && <><dt className="text-muted">vehicle</dt><dd>{user.profile.vehicle}</dd></>}
              {user.profile?.stock && <><dt className="text-muted">stock</dt>
                <dd>{Object.entries(user.profile.stock).map(([k, v]) => `${v} ${k}`).join(", ")}</dd></>}
              {user.profile?.notes && <><dt className="text-muted">notes</dt><dd>{user.profile.notes}</dd></>}
            </dl>
          </details>

          <div>
            <h2 className="mb-2 text-xl font-bold">
              Your top task {open.length > 1 && <span className="text-sm font-normal text-muted">({open.length - 1} more)</span>}
            </h2>
            {top ? <TaskCard task={top.task} now={now} onAction={onAction} notice={notes[top.raw._id]}
              busy={local[top.raw._id]?.pending} reported={top.reported} demo={local[top.raw._id]?.demo}
              assigneeName={props.users.find((u) => u._id === top.task.assignee)?.name} />
                 : <p className="text-sm text-muted">Nothing assigned to you.</p>}
            {closed.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm">
                {closed.map(([id, l]) => (
                  <li key={id} className="flex flex-wrap items-center gap-2">
                    <span className={statusTag}>{statusText(l.status)}</span>
                    <span>{l.title}</span>
                    {l.demo && <span className={demoTag}>Demo</span>}
                    {notes[id] && <span className="text-muted">{notes[id]}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h2 className="mb-2 text-xl font-bold">
              Your needs {needs.length > 0 && <span className="text-sm font-normal text-muted">({needs.length})</span>}
            </h2>
            <YourNeeds needs={needs} now={now} />
          </div>
        </section>

        <div className="flex min-w-0">
          <section aria-label="Your agent" className={`${card} flex min-w-0 flex-1 flex-col overflow-hidden`}>
            <h2 className="border-b border-line px-4 py-3 text-xl font-bold">Your agent</h2>
            <div className="flex min-h-80 flex-1 flex-col gap-3 overflow-y-auto bg-paper p-4 lg:max-h-[32rem]">
              {messages.length === 0 && <p className="text-sm text-muted">Talk to your agent.</p>}
              {messages.map((m) => <ChatLine key={m._id} m={m} name={user.name} />)}
            </div>
            <form className="flex gap-2 border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); send(); }}>
              <label htmlFor="agent-msg" className="sr-only">Message your agent</label>
              <input id="agent-msg" value={text} onChange={(e) => setText(e.target.value)} placeholder="Tell your agent"
                className="min-w-0 flex-1 rounded-button border border-muted px-3 py-2 text-sm" />
              <button className={button.primary}>Send</button>
            </form>
            {stub && <p className="px-4 pb-3 text-xs text-muted">{chatErrorText(0, null)} This is a stub reply.</p>}
          </section>
          <VizSpace asks={asks} open={vizOpen} onClose={closeViz} events={server ? events : undefined} user={user._id} />
        </div>
      </div>

      <section ref={feedRef} className={`${card} max-h-[28rem] min-h-0 overflow-y-auto p-4`}>
        {report ? <EventReport e={report} now={now} actorName={nameOf(report.actor)} onBack={closeReport}
          demo={demoLines.has(report._id)} /> : <>
          <h2 className="text-xl font-bold">Desk feed</h2>
          <ul>{events.map((e) => <EventRow key={e._id} e={e} now={now} actorName={nameOf(e.actor)}
            demo={demoLines.has(e._id)} onOpen={() => openReport(e._id)} />)}</ul>
        </>}
      </section>
    </div>
  );
}
