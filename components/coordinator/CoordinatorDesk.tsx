"use client";
// The coordinator screen: decisions, tasks nobody fits, low-risk work handed out, open problems.
// Polls GET /api/board. Until that route answers it shows the fixtures and says so.
import { useEffect, useState, type ReactNode } from "react";
import { CircleCheck, Gavel, Send, TriangleAlert, UserX, type LucideIcon } from "lucide-react";
import type { User } from "@/lib/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { actorLabel, statusWord } from "../detail/fields";
import { RecordCard } from "../RecordCard";
import { IncidentCards } from "../BoardCards";
import { ageText } from "../encode";
import { usePolled } from "../map/usePolled";
import { ApprovalCard, TaskMeta } from "./ApprovalCard";
import { fromBoard, handedOut, type CoordinatorItem, type CoordinatorSource } from "./coordinatorItems";

const ROLE_PLURAL: Record<string, string> = {
  volunteer: "volunteers", field: "field teams", supplier: "suppliers", shelter: "shelters", coordinator: "coordinators",
};
const ROLE_ONE: Record<string, string> = { field: "field team" };
const roles = (who: string, n: number) =>
  who.split(" or ").map((r) => (n === 1 ? ROLE_ONE[r] ?? r : ROLE_PLURAL[r] ?? r)).join(" or ");

// The dispatcher's reason, as a person would say it.
// "escalated, nobody fits: 2 volunteer on the desk, 1 not seen in 3 minutes, 1 with 3 open tasks"
// → "No one free: 2 volunteers on the desk, 1 offline, 1 busy with 3 tasks."
export function plainReason(reason: string): string {
  const r = reason.replace(/^escalated,\s*/i, "").trim();
  const none = r.match(/^nobody fits: no (.+?) on the desk\.?$/i);
  if (none) return `No ${roles(none[1], 2)} on the desk.`;
  const some = r.match(/^nobody fits: (\d+) (.+?) on the desk[,;]?\s*(.*)$/i);
  if (some) {
    const n = Number(some[1]);
    const parts = some[3].split(/[,;]\s*/).filter(Boolean).map((p) => p
      .replace(/^(\d+) not seen in \d+ minutes?$/i, "$1 offline")
      .replace(/^(\d+) with (\d+) open tasks$/i, "$1 busy with $2 tasks"));
    return `No one free: ${[`${n} ${roles(some[2], n)} on the desk`, ...parts].join(", ")}.`;
  }
  const out = r.replace(/_/g, " ");
  return out.charAt(0).toUpperCase() + out.slice(1);
}

const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

function SectionHead({ icon: Icon, title, count }: { icon: LucideIcon; title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="size-4 text-muted-foreground" />
      <h3 className="text-sm font-semibold">{title}</h3>
      {count !== undefined && <Badge variant="secondary" className="font-mono">{count}</Badge>}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
      <CircleCheck className="size-4" />{children}
    </p>
  );
}

export function CoordinatorDesk({ initial, userId, people }: {
  initial: CoordinatorSource; userId: string; people: User[];
}) {
  const { data, live, now } = usePolled<CoordinatorSource>("/api/board", initial);
  const { approvals, escalated, problems } = fromBoard(data);
  const given = handedOut(data);
  // The person list is asked once. Until it answers (or if it fails) the fixture people stand in.
  const [roster, setRoster] = useState<User[] | null>(null);
  useEffect(() => {
    let stop = false;
    fetch("/api/users", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => { if (!stop && Array.isArray(b)) setRoster(b as User[]); })
      .catch(() => {});
    return () => { stop = true; };
  }, []);
  const everyone = roster ?? people;
  const nameOf = (id: string) => everyone.find((p) => p._id === id)?.name ?? actorLabel(id);
  const demo = !live || !roster;

  return (
    <main className="mx-auto max-w-7xl p-4 md:p-6">
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight">Coordinator</h2>
          <p className="text-sm text-muted-foreground">On duty: {nameOf(userId)}</p>
        </div>
        <div className="ml-auto">
          {demo
            ? <Badge variant="outline" title={!live ? "The desk is not answering, so this shows demo data" : "The people list is demo data"}>Demo data</Badge>
            : <Badge variant="outline"><span className="size-1.5 rounded-full bg-success" />Live</Badge>}
        </div>
      </header>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-8">
          <section aria-label="Decisions" className="flex flex-col gap-3">
            <SectionHead icon={Gavel} title="Waiting for your decision" count={approvals.length} />
            {approvals.length === 0 && <Empty>Nothing is waiting.</Empty>}
            {approvals.map((it) => (
              <ApprovalCard key={it.task._id} item={it} now={now} userId={userId} people={everyone} />
            ))}
          </section>

          <section aria-label="Nobody fits" className="flex flex-col gap-3">
            <SectionHead icon={UserX} title="Nobody fits these tasks" count={escalated.length} />
            {escalated.length === 0 && <Empty>Every task has someone.</Empty>}
            {escalated.map((it) => <EscalatedCard key={it.task._id} item={it} now={now} nameOf={nameOf} />)}
          </section>

          <section aria-label="Handed out without you" className="flex flex-col gap-3">
            <SectionHead icon={Send} title="Handed out without you" />
            {given.length === 0 ? <Empty>Nothing yet.</Empty> : (
              <ul className="divide-y rounded-xl border bg-card shadow-xs">
                {given.map(({ task, at }) => {
                  const who = nameOf(task.assignee ?? "");
                  return (
                    <li key={task._id} className="flex items-center gap-3 px-4 py-3 text-sm">
                      <Avatar size="sm"><AvatarFallback className="text-[10px] font-medium">{initials(who)}</AvatarFallback></Avatar>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{task.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {who} · <span suppressHydrationWarning>{ageText(at, now)}</span>
                        </span>
                      </span>
                      <Badge variant="outline">{statusWord(task.status)}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <aside aria-label="Problems in the field" className="flex flex-col gap-3 lg:sticky lg:top-4">
          <SectionHead icon={TriangleAlert} title="Problems in the field" count={problems.length} />
          {problems.length === 0 && <Empty>No open problems.</Empty>}
          <IncidentCards items={problems} now={now} />
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
      <TaskMeta item={item} now={now} />
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-sm">
        <span className="text-xs text-muted-foreground">Tried</span>
        {task.tried.length
          ? task.tried.map((id) => <Badge key={id} variant="secondary">{nameOf(id)}</Badge>)
          : <span className="text-xs text-muted-foreground">nobody yet</span>}
      </div>
      {last && <p className="mt-2 text-sm text-muted-foreground">{plainReason(last.reason)}</p>}
    </RecordCard>
  );
}
