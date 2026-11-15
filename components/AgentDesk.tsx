"use client";
import { useState } from "react";
import type { Event, Message, Task, User } from "@/lib/types";
import { EventRow } from "./EventRow";
import { TaskCard, type TaskAction } from "./TaskCard";
import { ChatLine } from "./ChatLine";
import { stubReply } from "./stubAgent";

type FeedEvent = Event & { _id: string };

// Left: everything entering the desk, from anyone. Right: this person and their own agent.
export function AgentDesk(props: {
  user: User; users: User[]; events: FeedEvent[]; messages: Message[]; tasks: Task[]; now: number;
}) {
  const { user, now } = props;
  const [events, setEvents] = useState(props.events);
  const [messages, setMessages] = useState(props.messages);
  const [text, setText] = useState("");
  const [stub, setStub] = useState(false);
  const top = props.tasks[0];
  const nameOf = (id: string) => props.users.find((u) => u._id === id)?.name ?? id;

  function localEvent(e: Omit<FeedEvent, "_id" | "ts" | "deskId" | "lane" | "status" | "actor">) {
    setEvents((xs) => [{ ...e, _id: `local-${xs.length}`, ts: new Date(), deskId: user.deskId,
      lane: 0, status: "pending", actor: user._id }, ...xs]);
  }

  async function send() {
    const said = text.trim();
    if (!said) return;
    setText("");
    setMessages((m) => [...m, { _id: `u${m.length}`, userId: user._id, from: "user", text: said, ts: new Date() }]);
    let reply: string;
    try {
      const r = await fetch(`/api/chat?user=${user._id}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: said }),
      });
      if (!r.ok) throw new Error(String(r.status));
      reply = (await r.json()).reply;
      setStub(false);
    } catch {
      reply = stubReply(user, top, said);
      setStub(true);
    }
    setMessages((m) => [...m, { _id: `a${m.length}`, userId: user._id, from: "agent", text: reply, ts: new Date() }]);
  }

  function onAction(a: TaskAction) {
    if (!top) return;
    // TODO swap for POST /api/events once Role 1 ships it. Buttons must work without the model.
    if (a === "problem") {
      localEvent({ type: "incident", source: "person",
        payload: { kind: "other", text: "Problem button", textEn: "Problem button pressed", taskId: top._id, canContinue: false } });
    } else {
      localEvent({ type: "answer", source: "person", payload: { taskId: top._id, result: a } });
    }
  }

  return (
    <div className="grid min-h-0 flex-1 gap-6 md:grid-cols-[5fr_7fr]">
      <section className="order-2 min-h-0 overflow-y-auto md:order-1">
        <h2 className="font-mono text-xs uppercase tracking-wide text-muted">Desk feed · everyone</h2>
        <ul>{events.map((e) => <EventRow key={e._id} e={e} now={now} actorName={nameOf(e.actor)} />)}</ul>
      </section>

      <section className="order-1 flex min-h-0 flex-col gap-4 md:order-2">
        <details className="rounded-card border border-line bg-card p-3 text-sm">
          <summary className="cursor-pointer">
            <span className="font-medium">{user.name}</span>
            <span className="text-muted"> · {user.role} · {user.trust} · {user.region}</span>
            <span className="ml-2 font-mono text-xs text-muted">context file</span>
          </summary>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-xs">
            {user.profile?.skills && <><dt className="text-muted">skills</dt><dd>{user.profile.skills.join(", ")}</dd></>}
            {user.profile?.vehicle && <><dt className="text-muted">vehicle</dt><dd>{user.profile.vehicle}</dd></>}
            {user.profile?.stock && <><dt className="text-muted">stock</dt>
              <dd>{Object.entries(user.profile.stock).map(([k, v]) => `${v} ${k}`).join(", ")}</dd></>}
            {user.profile?.notes && <><dt className="text-muted">notes</dt><dd>{user.profile.notes}</dd></>}
          </dl>
        </details>

        <div>
          <h2 className="mb-2 font-mono text-xs uppercase tracking-wide text-muted">
            Your top task {props.tasks.length > 1 && `· ${props.tasks.length - 1} more`}
          </h2>
          {top ? <TaskCard task={top} now={now} onAction={onAction} />
               : <p className="text-sm text-muted">Nothing assigned to you.</p>}
        </div>

        <div className="flex min-h-48 flex-1 flex-col rounded-card border border-line bg-card">
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {messages.length === 0 && <p className="text-sm text-muted">Talk to your agent.</p>}
            {messages.map((m) => <ChatLine key={m._id} m={m} name={user.name} />)}
          </div>
          <form className="flex gap-2 border-t border-line p-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Tell your agent…"
              className="min-w-0 flex-1 rounded-card border border-line px-2 py-1.5 text-sm outline-none focus:border-ink" />
            <button className="rounded-card border border-ink px-3 text-sm">Send</button>
          </form>
          {stub && <p className="px-3 pb-2 font-mono text-xs text-muted">stub agent: /api/chat not up yet</p>}
        </div>
      </section>
    </div>
  );
}
