// /field?user=<id>: the field team's phone view. Default user is the seeded field team.
// The server reads the board from the database, so the first paint is the real desk. Only when
// the database cannot be reached does it show the demo board and say so. Polls GET /api/board after.
import { makeFieldBoard } from "@/fixtures/field";
import { FirstMinute } from "@/components/FirstMinute";
import { FieldPhone } from "@/components/field/FieldPhone";
import { deskId } from "@/lib/db";
import { boardJson } from "@/lib/shared";

export const dynamic = "force-dynamic";

type FieldBoard = ReturnType<typeof makeFieldBoard>;

export default async function FieldPage({ searchParams }: { searchParams: Promise<{ user?: string, task?: string }> }) {
  const { user, task } = await searchParams;
  const id = user || "field-alpha";
  try {
    // JSON round trip: the same shape the polls return (dates as ISO strings).
    const board = JSON.parse(await boardJson(deskId())) as FieldBoard;
    return <><FirstMinute screen="field" /><FieldPhone key={id} user={id} wanted={task} initial={board} initialLive /></>;
  } catch (err) {
    console.error("first paint: database not reachable, showing the demo board:", err instanceof Error ? err.message : err);
    return <><FirstMinute screen="field" /><FieldPhone key={id} user={id} wanted={task} initial={makeFieldBoard(Date.now())} /></>;
  }
}
