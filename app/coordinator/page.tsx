// /coordinator: approve risky work, fix tasks nobody fits, watch problems, pin or push down records.
// ?user=<id> is who presses the buttons (demo only, replaced by login later).
// The server reads the board from the database, so the first paint is the real desk. Only when the
// database cannot be reached does it show the demo board (with the two coordinator-only tasks) and say so.
import { makeBoard } from "@/fixtures/board";
import { makeCoordinatorTasks } from "@/fixtures/coordinator";
import { users } from "@/fixtures/desk";
import { FirstMinute } from "@/components/FirstMinute";
import { CoordinatorDesk } from "@/components/coordinator/CoordinatorDesk";
import { deskId } from "@/lib/db";
import { boardJson } from "@/lib/shared";

export const dynamic = "force-dynamic";

export default async function CoordinatorPage({ searchParams }: { searchParams: Promise<{ user?: string }> }) {
  const { user } = await searchParams;
  const id = user || "coordinator-duty";
  try {
    // boardJson returns a JSON string; parse it so `initial` holds the same shape the polls return.
    const board = JSON.parse(await boardJson(deskId())) as ReturnType<typeof makeBoard>;
    return <><FirstMinute screen="coordinator" /><CoordinatorDesk initial={board} initialLive userId={id} people={users} /></>;
  } catch (err) {
    console.error("coordinator first paint: database not reachable, showing the demo board:", err instanceof Error ? err.message : err);
    const now = Date.now();
    const b = makeBoard(now);
    const initial = { ...b, tasks: [...b.tasks, ...makeCoordinatorTasks(now)] };
    return <><FirstMinute screen="coordinator" /><CoordinatorDesk initial={initial} userId={id} people={users} /></>;
  }
}