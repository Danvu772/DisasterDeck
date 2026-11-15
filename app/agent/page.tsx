// Agent page: one person's own agent and tasks, with the desk's event feed below.
// ?user=<id> picks the person (demo only, replaced by login later).
import Link from "next/link";
import { FirstMinute } from "@/components/FirstMinute";
import { AgentDesk } from "@/components/AgentDesk";
import { makeEvents, makeMessages, users } from "@/fixtures/desk";
import { makeBoard } from "@/fixtures/board";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AgentPage({ searchParams }: { searchParams: Promise<{ user?: string }> }) {
  const { user: id } = await searchParams;
  const user = users.find((u) => u._id === id) ?? users[0];
  const now = Date.now();

  return (
    <>
    <FirstMinute screen="agent" />
    <main className="mx-auto flex max-w-7xl flex-col gap-5 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">My desk</h1>
        <nav aria-label="Switch person (demo)"
          className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border bg-card p-1 shadow-xs">
          <span className="shrink-0 px-2 text-xs text-muted-foreground">View as</span>
          {users.map((u) => {
            const active = u._id === user._id;
            return (
              <Link key={u._id} href={`/agent?user=${u._id}`} aria-current={active ? "true" : undefined}
                className={cn("inline-flex h-7 max-w-44 shrink-0 items-center truncate rounded-full px-3 text-xs font-medium transition-colors",
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
                <span className="truncate">{u.name}</span>
              </Link>
            );
          })}
        </nav>
      </header>
      <AgentDesk key={user._id} user={user} users={users} events={makeEvents(now)}
        messages={makeMessages(user._id, now)} initial={makeBoard(now)} />
    </main>
    </>
  );
}
