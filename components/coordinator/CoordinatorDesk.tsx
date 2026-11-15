"use client";
// The coordinator screen: decisions, tasks nobody fits, low-risk work handed out, open problems.
// Polls GET /api/board. Until that route answers it shows the fixtures and says so.
import type { User } from "@/lib/types";
import { RecordCard } from "../RecordCard";
import { IncidentCards } from "../BoardCards";
import { ageText, pill, statusTag, statusText } from "../encode";
import { usePolled } from "../map/usePolled";
import { ApprovalCard } from "./ApprovalCard";
import { fromBoard, handedOut, type CoordinatorItem, type CoordinatorSource } from "./coordinatorItems";

export function CoordinatorDesk({ initial, userId, people }: {
  initial: CoordinatorSource; userId: string; people: User[];
}) {
  const { data, live, now } = usePolled<CoordinatorSource>("/api/board", initial);
  const { approvals, escalated, problems } = fromBoard(data);
  const given = handedOut(data);
  const nameOf = (id: string) => people.find((p) => p._id === id)?.name ?? id;
  const pickable = people.filter((p) => p.role !== "coordinator" && p.role !== "public");

  return (
    <main className="mx-auto max-w-7xl p-4">
      <header className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-xl font-bold">Coordinator</h2>
        <span className="text-sm text-muted">Acting as {nameOf(userId)} (demo)</span>
        <span className="ml-auto text-sm text-muted">
          {live ? "Live from the desk." : "Demo data, the board API is not answering."}
        </span>
      </header>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          <section aria-label="Decisions">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="text-lg font-bold">Waiting for your decision</h3>
              <span className={`${pill} font-mono`}>{approvals.length}</span>
            </div>
            <p className="mt-1 text-sm text-muted">Rules propose. You decide. Every answer goes into the record history.</p>
            <div className="mt-2 space-y-2">
              {approvals.length === 0 && <p className="text-sm text-muted">Nothing is waiting.</p>}
              {approvals.map((it) => (
                <ApprovalCard key={it.task._id} item={it} now={now} userId={userId} people={pickable} />
              ))}
            </div>
          </section>

          <section aria-label="Nobody fits">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="text-lg font-bold">Nobody fits these tasks</h3>
              <span className={`${pill} font-mono`}>{escalated.length}</span>
            </div>
            <div className="mt-2 space-y-2">
              {escalated.length === 0 && <p className="text-sm text-muted">Every task has someone.</p>}
              {escalated.map((it) => <EscalatedCard key={it.task._id} item={it} now={now} nameOf={nameOf} />)}
            </div>
          </section>

          <section aria-label="Handed out without you" className="rounded-card border border-line bg-card p-4">
            <h3 className="text-lg font-bold">Handed out without you</h3>
            <p className="mt-1 text-sm text-muted">Low-risk work goes straight to people.</p>
            {given.length === 0 && <p className="mt-2 text-sm text-muted">Nothing yet.</p>}
            <ul className="mt-2">
              {given.map(({ task, at }) => (
                <li key={task._id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line py-2 text-sm">
                  <span className="w-24 shrink-0 font-mono text-xs text-muted">{ageText(at, now)}</span>
                  <span className="min-w-0 flex-1">{task.title}, to <span className="font-bold">{nameOf(task.assignee ?? "")}</span></span>
                  <span className={statusTag}>{statusText(task.status)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside aria-label="Problems in the field">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="text-lg font-bold">Problems in the field</h3>
            <span className={`${pill} font-mono`}>{problems.length}</span>
          </div>
          <div className="mt-2 space-y-2">
            {problems.length === 0 && <p className="text-sm text-muted">No open problems.</p>}
            <IncidentCards items={problems} now={now} />
          </div>
        </aside>
      </div>
    </main>
  );
}

function EscalatedCard({ item, now, nameOf }: {
  item: CoordinatorItem; now: number; nameOf: (id: string) => string;
}) {
  const { task, about } = item;
  const last = task.history.at(-1);
  return (
    <RecordCard type={task.recordType} title={task.title} detail={task.detail}
      tier={task.tier} priority={task.priority} confidence={about.confidence} status={task.status}
      at={about.at} source={about.source} sources={about.sources}
      actNow={new Date(task.deadline).getTime() < now} history={task.history} now={now}>
      <p className="mt-1 text-xs text-muted">
        About: {about.found ? about.name : `${about.name}, not on the board`}
      </p>
      <p className="mt-1 text-sm">
        Tried: {task.tried.length ? task.tried.map(nameOf).join(", ") : "nobody yet"}
      </p>
      {last && <p className="mt-1 text-sm"><span className="font-bold">{last.by}:</span> {last.reason}</p>}
    </RecordCard>
  );
}
