"use client";
import Link from "next/link";
import { useState } from "react";
import type { Task } from "@/lib/types";
import { RecordCard } from "./RecordCard";
import { button, link, minutesSince } from "./encode";
import { problemChoices, type ProblemKind, type TaskAction } from "./taskEvents";

export type { TaskAction };

// Four buttons that work without the model. Problem is the only red button in the app.
// busy: a post is in flight. reported: a problem was sent. Either one locks every button.
// demo: nothing reached the desk, so the result gets a muted tag.
export function TaskCard({ task, now, onAction, assigneeName, notice, busy, reported, demo }: {
  task: Task; now: number; onAction?: (a: TaskAction, kind?: ProblemKind) => void; assigneeName?: string;
  notice?: string; busy?: boolean; reported?: boolean; demo?: boolean;
}) {
  const locked = !!busy || !!reported;
  const [picking, setPicking] = useState(false);
  const waited = minutesSince(task.history[0]?.ts ?? task.deadline, now);
  const overdue = task.open && new Date(task.deadline).getTime() < now;
  // One primary action, the rest outline (USWDS). Accept until accepted, then Done.
  const next: TaskAction = task.status === "accepted" ? "done" : "accepted";
  const off = "disabled:cursor-not-allowed disabled:opacity-50";
  const btn = (a: TaskAction) => (a === next ? button.primary : button.outline);
  return (
    <RecordCard
      type={task.recordType}
      title={task.title}
      detail={task.detail}
      tier={task.tier}
      priority={task.priority}
      scoreParts={task.scoreParts}
      confidence="confirmed"
      status={reported ? "problem_reported" : task.status}
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
        <button className={`${btn("accepted")} ${off}`} disabled={locked || task.status === "accepted"}
          onClick={() => onAction?.("accepted")}>Accept</button>
        <button className={`${btn("declined")} ${off}`} disabled={locked} onClick={() => onAction?.("declined")}>Decline</button>
        <button className={`${btn("done")} ${off}`} disabled={locked} onClick={() => onAction?.("done")}>Done</button>
        <button
          className={`${button.act} ${off}`}
          disabled={locked}
          onClick={() => setPicking((p) => !p)}
        >
          Problem
        </button>
      </div>
      {picking && !locked && (
        <div className="mt-2">
          <p className="text-sm font-bold">What is the problem?</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {problemChoices.map((c) => (
              <button key={c.kind} className={button.outline}
                onClick={() => { setPicking(false); onAction?.("problem", c.kind); }}>{c.label}</button>
            ))}
          </div>
        </div>
      )}
      {(notice || demo) && (
        <p role="status" className="mt-2 flex items-center gap-2 text-sm font-bold">
          {notice}
          {demo && <span className="rounded-tag border border-line px-1.5 text-xs font-normal text-muted">Demo</span>}
        </p>
      )}
    </RecordCard>
  );
}
