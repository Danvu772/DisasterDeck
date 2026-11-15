"use client";
import { useState } from "react";
import type { User } from "@/lib/types";
import { RecordCard } from "../RecordCard";
import { button, minutesSince } from "../encode";
import type { CoordinatorItem } from "./coordinatorItems";

type Sent = { busy: boolean; text?: string };

// A task waiting for a coordinator. Approve is the one expected action, Modify and Reject are outline.
export function ApprovalCard({ item, now, userId, people }: {
  item: CoordinatorItem; now: number; userId: string; people: User[];
}) {
  const { task, about } = item;
  const [sent, setSent] = useState<Sent>({ busy: false });
  const [modify, setModify] = useState(false);
  const [pick, setPick] = useState(people[0]?._id ?? "");

  const waited = minutesSince(task.history[0]?.ts ?? task.deadline, now);
  const overdue = new Date(task.deadline).getTime() < now;

  async function answer(approved: boolean) {
    setSent({ busy: true, text: "Sending" });
    try {
      const r = await fetch(`/api/events?user=${encodeURIComponent(userId)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "approval", source: "person", payload: { taskId: task._id, approved } }),
      });
      if (r.ok) {
        setSent({ busy: false, text: approved ? "Approved, sent" : "Rejected, sent" });
      } else {
        const body = (await r.json().catch(() => null)) as { error?: string } | null;
        setSent({ busy: false, text: `Not sent: ${body?.error ?? `the desk answered ${r.status}`}` });
      }
    } catch {
      setSent({ busy: false, text: "Not sent: the desk did not answer" });
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
      <p className="mt-1 text-xs text-muted">
        About: {about.found ? about.name : `${about.name}, not on the board`}
      </p>
      <p className="mt-1 text-xs text-muted">
        Waiting <span className="font-mono">{waited} min</span>
        {overdue && <span className="ml-1 font-bold text-act">Waiting too long</span>}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button className={button.primary} disabled={sent.busy} onClick={() => answer(true)}>Approve</button>
        <button className={button.outline} disabled={sent.busy} onClick={() => setModify((m) => !m)}>Modify</button>
        <button className={button.outline} disabled={sent.busy} onClick={() => answer(false)}>Reject</button>
      </div>
      {sent.text && <p className="mt-2 text-sm font-bold">{sent.text}</p>}
      {modify && (
        <div className="mt-2 rounded-card border border-line p-2 text-sm">
          <label className="flex flex-wrap items-center gap-2">
            Send someone else
            <select value={pick} onChange={(e) => setPick(e.target.value)}
              className="rounded-button border border-muted bg-card px-2 py-1">
              {people.map((p) => <option key={p._id} value={p._id}>{p.name}, {p.role}</option>)}
            </select>
          </label>
          <p className="mt-1 text-muted">Modify is not wired to the API yet.</p>
        </div>
      )}
    </RecordCard>
  );
}
