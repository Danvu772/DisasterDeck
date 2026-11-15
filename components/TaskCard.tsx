"use client";
import type { Task } from "@/lib/types";
import { RecordCard } from "./RecordCard";
import { minutesSince } from "./encode";

export type TaskAction = "accepted" | "declined" | "done" | "problem";

// Four buttons that work without the model. Problem is the only red button in the app.
export function TaskCard({ task, now, onAction }: {
  task: Task; now: number; onAction?: (a: TaskAction) => void;
}) {
  const waited = minutesSince(task.history[0]?.ts ?? task.deadline, now);
  const overdue = task.open && new Date(task.deadline).getTime() < now;
  const btn = "rounded-card border border-line px-3 py-1.5 text-sm hover:border-ink";
  return (
    <RecordCard
      type={task.recordType}
      title={task.title}
      detail={task.detail}
      tier={task.tier}
      priority={task.priority}
      confidence="confirmed"
      status={task.status}
      at={task.history[0]?.ts ?? new Date(now)}
      source="system"
      actNow={overdue}
      history={task.history}
      now={now}
    >
      <p className="mt-1 text-xs text-muted">
        {task.assignee ? `owner: ${task.assignee}` : "unassigned"} · waited {waited} min
        {overdue && <span className="ml-1 font-semibold text-act">overdue</span>}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button className={btn} onClick={() => onAction?.("accepted")}>Accept</button>
        <button className={btn} onClick={() => onAction?.("declined")}>Decline</button>
        <button className={btn} onClick={() => onAction?.("done")}>Done</button>
        <button
          className="rounded-card bg-act px-3 py-1.5 text-sm font-semibold text-card"
          onClick={() => onAction?.("problem")}
        >
          Problem
        </button>
      </div>
    </RecordCard>
  );
}
