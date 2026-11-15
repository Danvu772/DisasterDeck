// Landing: who is on the desk (click a person to open their agent), then the shared board.
// Fixtures until /api/board and the users list exist.
import Link from "next/link";
import { makeBoard } from "@/fixtures/board";
import { users } from "@/fixtures/desk";
import { BoardTabs } from "@/components/BoardTabs";
import { HealthLine } from "@/components/HealthLine";

export const dynamic = "force-dynamic";

export default function Desk() {
  const now = Date.now();
  const b = makeBoard(now);

  return (
    <main className="mx-auto max-w-6xl p-4">
      <header className="flex items-baseline gap-3">
        <h2 className="text-xl font-bold">People on the desk</h2>
        <span className="ml-auto"><HealthLine {...b.health} /></span>
      </header>
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
    </main>
  );
}
