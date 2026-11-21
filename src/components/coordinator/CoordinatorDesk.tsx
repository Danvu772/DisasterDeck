"use client";
// The coordinator screen: decisions, tasks nobody fits, low-risk work handed out, open problems,
// and the ranking of sites and needs (pin / push down). Polls GET /api/board. Until that route
// answers it shows the fixtures and says so.
import { useEffect, useState, type ReactNode } from "react";
import { CircleCheck, Gavel, Send, TriangleAlert, UserX, type LucideIcon } from "lucide-react";
import type { User } from "@/lib/types";
import { actorLabel, plainStep, statusWord } from "../detail/fields";
import { ageText } from "../encode";
import { usePolled } from "../map/usePolled";
import { ApprovalCard, TaskMeta } from "./ApprovalCard";
import { IncidentCard } from "./IncidentCard";
import { PinCard } from "./PinCard";
import { fromBoard, handedOut, rankable, type CoordinatorItem, type CoordinatorSource } from "./coordinatorItems";
import { card, KindGlyph, TierTag } from "./parts";

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
    <div className="flex flex-wrap items-center gap-2">
      <Icon className="size-4 shrink-0 text-usa-base-dark" aria-hidden />
      <h2 className="usa-heading m-0 text-base text-usa-ink">{title}</h2>
      {count !== undefined && (
        <span className="usa-tag bg-usa-base-lightest text-usa-ink"><span className="font-mono">{count}</span></span>
      )}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-usa-base-light p-4 text-sm text-usa-base-dark">
      <CircleCheck className="mr-2 inline size-4 align-text-bottom" aria-hidden />
      {children}
    </p>
  );
}

export function CoordinatorDesk({ initial, userId, people, initialLive }: {
  initial: CoordinatorSource; userId: string; people: User[]; initialLive?: boolean;
}) {
  const { data, live, now } = usePolled<CoordinatorSource>("/api/board", initial, 1000, initialLive);
  const { approvals, escalated, problems } = fromBoard(data);
  const given = handedOut(data);
  const toRank = rankable(data);
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
    <main className="min-h-full bg-usa-base-lightest">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
        <header className="flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <h1 className="usa-heading m-0 text-xl text-usa-ink">Coordinator</h1>
            <p className="mt-1 text-sm text-usa-base-dark">On duty: {nameOf(userId)}</p>
          </div>
          <div className="ml-auto">
            {demo
              ? <span className="usa-tag" title={!live ? "The desk is not answering, so this shows demo data" : "The people list is demo data"}>Demo data</span>
              : <span className="usa-tag bg-usa-base-lightest text-usa-ink"><span aria-hidden className="mr-1 inline-block size-1.5 rounded-full align-middle bg-usa-success" />Live</span>}
          </div>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[3fr_2fr]">
          <div className="flex min-w-0 flex-col gap-8">
            <section aria-label="Waiting for your decision" className="flex flex-col gap-3">
              <SectionHead icon={Gavel} title="Waiting for your decision" count={approvals.length} />
              {approvals.length === 0 && <Empty>Nothing is waiting.</Empty>}
              {approvals.map((it) => (
                <ApprovalCard key={it.task._id} item={it} now={now} userId={userId} people={everyone} />
              ))}
            </section>

            <section aria-label="Nobody fits these tasks" className="flex flex-col gap-3">
              <SectionHead icon={UserX} title="Nobody fits these tasks" count={escalated.length} />
              {escalated.length === 0 && <Empty>Every task has someone.</Empty>}
              {escalated.map((it) => <EscalatedCard key={it.task._id} item={it} now={now} nameOf={nameOf} />)}
            </section>

            <section aria-label="Handed out without you" className="flex flex-col gap-3">
              <SectionHead icon={Send} title="Handed out without you" />
              {given.length === 0 ? <Empty>Nothing yet.</Empty> : (
                <ul className="divide-y divide-usa-base-lighter overflow-hidden rounded-md border border-usa-base-lighter bg-usa-white">
                  {given.map(({ task, at }) => {
                    const who = nameOf(task.assignee ?? "");
                    return (
                      <li key={task._id} className="flex items-center gap-3 px-4 py-3 text-sm">
                        <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-usa-primary-lighter text-[10px] font-semibold text-usa-primary-darker">
                          {initials(who)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-usa-ink">{task.title}</span>
                          <span className="block truncate text-xs text-usa-base-dark">
                            {who} · <span suppressHydrationWarning>{ageText(at, now)}</span>
                          </span>
                        </span>
                        <span className="usa-tag bg-usa-base-lightest text-usa-ink">{statusWord(task.status)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          <div className="flex min-w-0 flex-col gap-8">
            <aside aria-label="Problems in the field" className="flex flex-col gap-3">
              <SectionHead icon={TriangleAlert} title="Problems in the field" count={problems.length} />
              {problems.length === 0 && <Empty>No open problems.</Empty>}
              {problems.map((i) => <IncidentCard key={i._id} incident={i} now={now} nameOf={nameOf} />)}
            </aside>

            <section aria-label="Rank the board" className="flex flex-col gap-3">
              <SectionHead icon={Gavel} title="Rank the board" count={toRank.length} />
              <p className="text-sm text-usa-base-dark">
                Pin keeps a site or need at the top of its tier; push down moves it to the bottom. Tier still wins: a
                pinned tier 1 record stays below every tier 0 record.
              </p>
              {toRank.length === 0 && <Empty>Nothing to rank.</Empty>}
              {toRank.map((r) => (
                <PinCard key={`${r.kind}:${r.id}`} item={r} userId={userId} nameOf={nameOf} />
              ))}
            </section>
          </div>
        </div>
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
    <article className={`${card} p-4`}>
      <header className="flex items-start gap-3">
        <KindGlyph kind={task.recordType} tier={task.tier} actNow={new Date(task.deadline).getTime() < now} />
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold leading-snug text-usa-ink">{task.title}</h3>
          <p className="mt-0.5 text-xs text-usa-base-dark" suppressHydrationWarning>
            {about.found ? about.name : "Record not on the board"} · {ageText(about.at, now)}
          </p>
        </div>
        <TierTag tier={task.tier} />
      </header>

      {task.detail && <p className="mt-3 text-sm text-usa-ink">{task.detail}</p>}
      <TaskMeta item={item} now={now} />

      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-sm">
        <span className="text-xs text-usa-base-dark">Tried</span>
        {task.tried.length
          ? task.tried.map((id) => <span key={id} className="usa-tag bg-usa-base-lightest text-usa-ink">{nameOf(id)}</span>)
          : <span className="text-xs text-usa-base-dark">nobody yet</span>}
      </div>
      {last && <p className="mt-2 text-sm text-usa-base-dark">{plainStep(plainReason(last.reason), nameOf)}</p>}
    </article>
  );
}