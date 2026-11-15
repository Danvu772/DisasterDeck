// Shared board, one tab per record type. Fixtures until GET /api/board exists.
import Link from "next/link";
import { makeBoard } from "@/fixtures/board";
import { BoardTabs } from "@/components/BoardTabs";
import { HealthLine } from "@/components/HealthLine";

export const dynamic = "force-dynamic";

export default function BoardPage() {
  const now = Date.now();
  const b = makeBoard(now);
  return (
    <main className="mx-auto max-w-6xl p-4">
      <header className="mb-3 flex items-baseline gap-3">
        <h1 className="font-semibold">Disaster Desk · Malatya</h1>
        <Link href="/agent" className="text-sm text-muted hover:text-ink">agent</Link>
        <span className="ml-auto"><HealthLine {...b.health} /></span>
      </header>
      <BoardTabs board={b} now={now} />
    </main>
  );
}
