// Agent page: the desk's event feed next to one person's own agent.
// ?user=<id> picks the person (demo only, replaced by login later).
import Link from "next/link";
import { AgentDesk } from "@/components/AgentDesk";
import { makeEvents, makeMessages, users } from "@/fixtures/desk";
import { makeBoard } from "@/fixtures/board";

export const dynamic = "force-dynamic";

export default async function AgentPage({ searchParams }: { searchParams: Promise<{ user?: string }> }) {
  const { user: id } = await searchParams;
  const user = users.find((u) => u._id === id) ?? users[0];
  const now = Date.now();
  const board = makeBoard(now);
  const byPriority = (a: { tier: number; priority: number }, b: { tier: number; priority: number }) =>
    a.tier - b.tier || b.priority - a.priority;
  const tasks = board.tasks.filter((t) => t.open && t.assignee === user._id).sort(byPriority);
  const needs = board.needs
    .filter((n) => n.requestedBy.includes(user._id) && n.status !== "cancelled")
    .sort(byPriority);

  return (
    <main className="mx-auto flex h-full max-w-6xl flex-col gap-4 p-4">
      <nav className="flex flex-wrap items-baseline gap-3 text-sm">
        <span className="font-mono text-xs text-muted">demo, talk as:</span>
        {users.map((u) => (
          <Link key={u._id} href={`/agent?user=${u._id}`}
            className={u._id === user._id ? "underline" : "text-muted hover:text-ink"}>
            {u.name}
          </Link>
        ))}
      </nav>
      <AgentDesk key={user._id} user={user} users={users} events={makeEvents(now)}
        messages={makeMessages(user._id, now)} tasks={tasks} needs={needs} now={now} />
    </main>
  );
}
