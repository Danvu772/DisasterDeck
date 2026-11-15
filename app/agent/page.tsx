// Agent page: one person's own agent and tasks, with the desk's event feed below.
// ?user=<id> picks the person (demo only, replaced by login later).
import Link from "next/link";
import { FirstMinute } from "@/components/FirstMinute";
import { AgentDesk } from "@/components/AgentDesk";
import { chip } from "@/components/encode";
import { makeEvents, makeMessages, users } from "@/fixtures/desk";
import { makeBoard } from "@/fixtures/board";
import { getBoard } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AgentPage({ searchParams }: { searchParams: Promise<{ user?: string }> }) {
  const { user: id } = await searchParams;
  const user = users.find((u) => u._id === id) ?? users[0];
  const now = Date.now();
  // The real board first, so the top task is what the desk has for this person. The demo board
  // only when the database cannot be reached, and the screen says so.
  let initial: ReturnType<typeof makeBoard>;
  let initialLive = false;
  try {
    // JSON round trip: the same shape the polls return (dates as ISO strings).
    initial = JSON.parse(JSON.stringify(await getBoard())) as ReturnType<typeof makeBoard>;
    initialLive = true;
  } catch (err) {
    console.error("first paint: database not reachable, showing the demo board:", err instanceof Error ? err.message : err);
    initial = makeBoard(now);
  }

  return (
    <>
    <FirstMinute screen="agent" />
    <main className="mx-auto flex max-w-7xl flex-col gap-4 p-4 md:p-6">
      <nav className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Demo. Talk as:</span>
        {users.map((u) => (
          <Link key={u._id} href={`/agent?user=${u._id}`} aria-current={u._id === user._id ? "true" : undefined}
            className={chip(u._id === user._id)}>
            {u.name}
          </Link>
        ))}
      </nav>
      <AgentDesk key={user._id} user={user} users={users} events={makeEvents(now)}
        messages={makeMessages(user._id, now)} initial={initial} initialLive={initialLive} />
    </main>
    </>
  );
}
