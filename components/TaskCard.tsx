"use client";
import Link from "next/link";
import type { Task } from "@/lib/types";
import { RecordCard } from "./RecordCard";
import { button, link, minutesSince } from "./encode";

export type TaskAction = "accepted" | "declined" | "done" | "problem";

// Four buttons that work without the model. Problem is the only red button in the app.
export function TaskCard({ task, now, onAction, assigneeName }: {
  task: Task; now: number; onAction?: (a: TaskAction) => void; assigneeName?: string;
}) {
  const waited = minutesSince(task.history[0]?.ts ?? task.deadline, now);
  const overdue = task.open && new Date(task.deadline).getTime() < now;
  // One primary action, the rest outline (USWDS). Accept until accepted, then Done.
  const next: TaskAction = task.status === "accepted" ? "done" : "accepted";
  const btn = (a: TaskAction) => (a === next ? button.primary : button.outline);
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
        {task.assignee
          ? <>Owner: <Link href={`/agent?user=${task.assignee}`} className={link}>{assigneeName ?? task.assignee}</Link></>
          : "Unassigned"}, waiting {waited} min
        {overdue && <span className="ml-1 font-bold text-act">Overdue</span>}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button className={btn("accepted")} onClick={() => onAction?.("accepted")}>Accept</button>
        <button className={btn("declined")} onClick={() => onAction?.("declined")}>Decline</button>
        <button className={btn("done")} onClick={() => onAction?.("done")}>Done</button>
        <button
          className={button.act}
          onClick={() => onAction?.("problem")}
        >
          Problem
        </button>
      </div>
    </RecordCard>
  );
}
