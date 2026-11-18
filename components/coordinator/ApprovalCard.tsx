"use client";
import { useId, useState } from "react";
import { Check, Clock, LoaderCircle, MapPin, UserRoundPen, X } from "lucide-react";
import { Alert, Button, Label, Select } from "@trussworks/react-uswds";
import type { User } from "@/lib/types";
import { cn } from "@/lib/utils";
import { minutesSince } from "../encode";
import { plainDetail, statusWord } from "../detail/fields";
import { peopleFor, type CoordinatorItem } from "./coordinatorItems";
import { card, KindGlyph, TierTag } from "./parts";

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
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-usa-base-dark">
      <span className="inline-flex min-w-0 items-center gap-1">
        <MapPin className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{about.found ? about.name : "Record not on the board"}</span>
      </span>
      <span className={cn("inline-flex items-center gap-1", overdue && "font-semibold text-usa-error")}>
        <Clock className="size-3.5" aria-hidden />
        Waiting <span className="font-mono">{waited} min</span>
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
    <article className={cn(card, "p-4", about.confidence === "unconfirmed" && "border-dashed")}>
      <header className="flex items-start gap-3">
        <KindGlyph kind={task.recordType} tier={task.tier} actNow={overdue} />
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold leading-snug text-usa-ink">{task.title}</h3>
          <p className="mt-0.5 text-xs text-usa-base-dark">
            {statusWord(task.status)} · <span suppressHydrationWarning>{minutesSince(task.history[0]?.ts ?? task.deadline, now)} min ago</span>
          </p>
        </div>
        <TierTag tier={task.tier} actNow={overdue} />
      </header>

      {task.detail && <p className="mt-3 text-sm text-usa-ink">{plainDetail(task.detail)}</p>}
      <TaskMeta item={item} now={now} />

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-usa-base-lighter pt-3">
        <Button type="button" disabled={sent.busy} onClick={() => answer(true)}><Check aria-hidden />Approve</Button>
        <Button type="button" outline disabled={sent.busy} aria-expanded={modify} onClick={() => setModify((m) => !m)}>
          <UserRoundPen aria-hidden />Modify
        </Button>
        <Button type="button" outline disabled={sent.busy} className="ml-auto" onClick={() => answer(false)}>
          <X aria-hidden />Reject
        </Button>
      </div>

      {modify && (
        <div className="mt-3 flex flex-col gap-2 rounded-md bg-usa-base-lightest p-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <Label htmlFor={pickerId}>Send someone else</Label>
            <Select id={pickerId} name="assignee" value={chosen?._id ?? ""} onChange={(e) => setPick(e.target.value)}>
              {options.map((p) => <option key={p._id} value={p._id}>{p.name} · {ROLE_WORD[p.role]}</option>)}
            </Select>
          </div>
          <Button type="button" disabled={sent.busy || !chosen} onClick={() => chosen && answer(true, chosen._id)}>
            Approve with this person
          </Button>
        </div>
      )}

      {modify && options.length === 0 && (
        <p className="mt-2 text-sm text-usa-base">Nobody of the right kind is on the list.</p>
      )}

      {sent.text && (
        !sent.busy && !sent.ok ? (
          <Alert type="error" slim role="status" className="mt-3">{sent.text}</Alert>
        ) : (
          <p role="status" className="mt-3 flex items-center gap-1.5 text-sm font-medium text-usa-ink">
            {sent.busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Check className="size-4 text-usa-success" aria-hidden />}
            {sent.text}
          </p>
        )
      )}
    </article>
  );
}