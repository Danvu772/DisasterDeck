// /coordinator: approve risky work, see who nobody fits, watch problems.
// ?user=<id> is who presses the buttons (demo only, replaced by login later).
import { makeBoard } from "@/fixtures/board";
import { makeCoordinatorTasks } from "@/fixtures/coordinator";
import { users } from "@/fixtures/desk";
import { FirstMinute } from "@/components/FirstMinute";
import { CoordinatorDesk } from "@/components/coordinator/CoordinatorDesk";

export const dynamic = "force-dynamic";

export default async function CoordinatorPage({ searchParams }: { searchParams: Promise<{ user?: string }> }) {
  const { user } = await searchParams;
  const now = Date.now();
  const b = makeBoard(now);
  const initial = { ...b, tasks: [...b.tasks, ...makeCoordinatorTasks(now)] };
  return <><FirstMinute screen="coordinator" /><CoordinatorDesk initial={initial} userId={user || "coordinator-duty"} people={users} /></>;
}
