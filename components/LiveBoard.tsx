"use client";
// The landing board. Polls /api/board every second, starts from the fixture the page passes in.
import Link from "next/link";
import type { makeBoard } from "@/fixtures/board";
import { users } from "@/fixtures/desk";
import { BoardTabs } from "./BoardTabs";
import { HealthLine } from "./HealthLine";
import { usePolled } from "./map/usePolled";

// The API board has every field of the fixture board (plus zones and fuller health), so one type fits both.
type DeskBoard = ReturnType<typeof makeBoard>;

export function LiveBoard({ initial }: { initial: DeskBoard }) {
  const { data: b, live, now } = usePolled<DeskBoard>("/api/board", initial);

  return (
    <>
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

      <div className="mt-6">
        <BoardTabs board={b} now={now} />
      </div>
    </>
  );
}
