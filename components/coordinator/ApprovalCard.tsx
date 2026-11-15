"use client";
import { useId, useState } from "react";
import { Check, CircleAlert, Clock, LoaderCircle, MapPin, UserRoundPen, X } from "lucide-react";
import type { User } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RecordCard } from "../RecordCard";
import { minutesSince } from "../encode";
import { peopleFor, type CoordinatorItem } from "./coordinatorItems";

export const ROLE_WORD: Record<User["role"], string> = {
  volunteer: "Volunteer", field: "Field team", supplier: "Supplier", shelter: "Shelter",
  coordinator: "Coordinator", public: "Citizen",
};

type Sent = { busy: boolean; text?: string; ok?: boolean };

// Where the task is and how long it has waited. Shared with the "Nobody fits" cards.
export function TaskMeta({ item, now }: { item: CoordinatorItem; now: number }) {
  const { task, about } = item;
  const waited = minutesSince(task.history[0]?.ts ?? task.deadline, now);
  const overdue = new Date(task.deadline).getTime() < now;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="inline-flex min-w-0 items-center gap-1">
        <MapPin className="size-3.5 shrink-0" />
        <span className="truncate">{about.found ? about.name : "Record not on the board"}</span>
      </span>
      <span className={cn("inline-flex items-center gap-1", overdue && "font-medium text-destructive")}>
        <Clock className="size-3.5" />Waiting <span className="font-mono">{waited} min</span>
        {overdue && <span>· too long</span>}
      </span>
    </div>
  );
}

// A task waiting for a coordinator. Approve is the one expected action, Modify and Reject are outline.
export function ApprovalCard({ item, now, userId, people }: {
  item: CoordinatorItem; now: number; userId: string; people: User[];
}) {
  const { task, about } = item;
  const [sent, setSent] = useState<Sent>({ busy: false });
  const [modify, setModify] = useState(false);
  const [pick, setPick] = useState("");
  const pickerId = useId();
  const options = peopleFor(task.type, people);
  const chosen = options.find((p) => p._id === pick) ?? options[0];
  const overdue = new Date(task.deadline).getTime() < now;

  async function answer(approved: boolean, assignee?: string) {
    setSent({ busy: true, text: "Sending" });
    try {
      const r = await fetch(`/api/events?user=${encodeURIComponent(userId)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "approval", source: "person", payload: { taskId: task._id, approved, ...(assignee ? { assignee } : {}) } }),
      });
      if (r.ok) {
        setSent({ busy: false, ok: true, text: !approved ? "Rejected, sent" : assignee ? `Approved for ${chosen?.name ?? assignee}, sent` : "Approved, sent" });
      } else {
        const body = (await r.json().catch(() => null)) as { error?: string } | null;
        setSent({ busy: false, ok: false, text: `Not sent: ${body?.error ?? `the desk answered ${r.status}`}` });
      }
    } catch {
      setSent({ busy: false, ok: false, text: "Not sent: the desk did not answer" });
    }
  }

  return (
    <RecordCard
      type={task.recordType}
      title={task.title}
      detail={task.detail}
      tier={task.tier}
      priority={task.priority}
      confidence={about.confidence}
      status={task.status}
      at={about.at}
      source={about.source}
      sources={about.sources}
      actNow={overdue}
      history={task.history}
      now={now}
    >
      <TaskMeta item={item} now={now} />
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
        <Button size="lg" className="px-4" disabled={sent.busy} onClick={() => answer(true)}><Check />Approve</Button>
        <Button size="lg" variant="outline" disabled={sent.busy} aria-expanded={modify}
          onClick={() => setModify((m) => !m)}><UserRoundPen />Modify</Button>
        <Button size="lg" variant="ghost" className="ml-auto text-muted-foreground" disabled={sent.busy}
          onClick={() => answer(false)}><X />Reject</Button>
      </div>
      {modify && (
        <div className="mt-3 flex flex-col gap-2 rounded-lg bg-secondary p-3 sm:flex-row sm:items-center">
          <label htmlFor={pickerId} className="shrink-0 text-sm font-medium">Send someone else</label>
          <select id={pickerId} value={chosen?._id ?? ""} onChange={(e) => setPick(e.target.value)}
            className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">
            {options.map((p) => <option key={p._id} value={p._id}>{p.name} · {ROLE_WORD[p.role]}</option>)}
          </select>
          <Button disabled={sent.busy || !chosen} onClick={() => chosen && answer(true, chosen._id)}>
            Approve with this person
          </Button>
          {options.length === 0 && <p className="text-sm text-muted-foreground">Nobody of the right kind is on the list.</p>}
        </div>
      )}
      {sent.text && (
        <p role="status" className="mt-3 flex items-center gap-1.5 text-sm font-medium">
          {sent.busy ? <LoaderCircle className="size-4 animate-spin" />
            : sent.ok ? <Check className="size-4" /> : <CircleAlert className="size-4" />}
          {sent.text}
        </p>
      )}
    </RecordCard>
  );
}
