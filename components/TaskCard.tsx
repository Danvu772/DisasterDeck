"use client";
import { AnimatePresence, motion } from "motion/react";
import { Check, CheckCheck, Clock, TriangleAlert, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { Task } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { actorLabel } from "./detail/fields";
import { minutesSince } from "./encode";
import { RecordCard } from "./RecordCard";
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
  // One primary action, the rest outline. Accept until accepted, then Done.
  const next: TaskAction = task.status === "accepted" ? "done" : "accepted";
  const v = (a: TaskAction) => (a === next ? "default" : "outline") as "default" | "outline";
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
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <UserRound className="size-3.5" aria-hidden />
          {task.assignee
            ? <Link href={`/agent?user=${task.assignee}`} className="font-medium text-foreground underline-offset-4 hover:underline">{assigneeName ?? actorLabel(task.assignee)}</Link>
            : "Unassigned"}
        </span>
        <span className="inline-flex items-center gap-1"><Clock className="size-3.5" aria-hidden />Waiting <span className="font-mono">{waited} min</span></span>
        {overdue && <span className="font-medium text-destructive">Overdue</span>}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {task.status !== "accepted" ? (
          <>
            <Button size="sm" variant={v("accepted")} disabled={locked} onClick={() => onAction?.("accepted")}>
              <Check aria-hidden />Accept
            </Button>
            <Button size="sm" variant={v("declined")} disabled={locked} onClick={() => onAction?.("declined")}>
              <X aria-hidden />Decline
            </Button>
          </>
        ) : (
          <Button size="sm" variant={v("done")} disabled={locked} onClick={() => onAction?.("done")}>
            <CheckCheck aria-hidden />Done
          </Button>
        )}
        {task.status === "accepted" && <Button size="sm" variant="destructive" disabled={locked} aria-expanded={picking} onClick={() => setPicking((p) => !p)}>
          <TriangleAlert aria-hidden />Problem
        </Button>}
      </div>
      <AnimatePresence initial={false}>
        {picking && !locked && (
          <motion.div key="pick" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }} className="overflow-hidden">
            <p className="mt-3 text-xs font-medium text-muted-foreground">What went wrong?</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {problemChoices.map((c) => (
                <Button key={c.kind} size="sm" variant="outline"
                  onClick={() => { setPicking(false); onAction?.("problem", c.kind); }}>{c.label}</Button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {(notice || demo) && (
        <p role="status" className="mt-3 flex items-center gap-2 text-sm font-medium">
          {notice}
          {demo && <span className="rounded-full border px-2 text-xs font-normal text-muted-foreground">Demo</span>}
        </p>
      )}
    </RecordCard>
  );
}
