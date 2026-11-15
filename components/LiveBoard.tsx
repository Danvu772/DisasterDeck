"use client";
// The landing board. Polls /api/board every second, starts from the fixture the page passes in.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { makeBoard } from "@/fixtures/board";
import { users } from "@/fixtures/desk";
import { AskDesk } from "./AskDesk";
import { BoardTabs } from "./BoardTabs";
import { useNavBottom } from "./detail/DetailPanel";
import { HealthLine } from "./HealthLine";
import { usePolled } from "./map/usePolled";

// The API board has every field of the fixture board (plus zones and fuller health), so one type fits both.
type DeskBoard = ReturnType<typeof makeBoard>;

export function LiveBoard({ initial }: { initial: DeskBoard }) {
  const { data: b, live, now } = usePolled<DeskBoard>("/api/board", initial);

  // With ?open= set the panel is fixed on the right (md and up), so this column gets its own scroll
  // and right padding the width of the panel. The side padding eases, so the board slides over.
  const open = useSearchParams().get("open") !== null;
  const nav = useNavBottom();

  return (
    <main style={{ "--nav-bottom": `${nav}px` } as React.CSSProperties}
      className={`p-4 md:transition-[padding] md:duration-200 md:ease-out motion-reduce:transition-none ${
        open
          ? "md:h-[calc(100dvh-var(--nav-bottom))] md:overflow-y-auto md:pl-4 md:pr-[calc(max(45%,420px)+1rem)]"
          : "md:px-[max(1rem,calc((100%_-_72rem)_/_2))]"}`}>
      <header className="flex items-baseline gap-3">
        <h2 className="text-xl font-bold">People on the desk</h2>
        <span className="ml-auto"><HealthLine {...b.health} /></span>
      </header>
      {!live && <p className="mt-1 text-sm text-muted">Demo data, the board API is not answering.</p>}
      <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {users.map((u) => {
          const tasks = b.tasks.filter((t) => t.open && t.assignee === u._id).length;
          const needs = b.needs.filter((n) => n.requestedBy.includes(u._id) && n.status !== "delivered").length;
          return (
            <li key={u._id}>
              <Link href={`/agent?user=${u._id}`}
                className="block rounded-card border-2 border-line bg-card p-3 hover:border-primary">
                <p className="text-lg font-bold text-primary underline">{u.name}</p>
                <p className="text-sm text-muted">{u.role}, {u.trust}, {u.region}. {u.status}.</p>
                <p className="mt-1 text-sm">
                  {tasks} {tasks === 1 ? "task" : "tasks"}, {needs} {needs === 1 ? "need" : "needs"}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>

      <AskDesk />

      <div className="mt-6">
        <BoardTabs board={b} now={now} live={live} />
      </div>
    </main>
  );
}
