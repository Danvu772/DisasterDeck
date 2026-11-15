// /map: sites and field problems on a map, USGS Latest Earthquakes layout.
// The server reads the board from the database, so the first paint is the real desk. Only when the
// database cannot be reached does it start from the fixture board. Polls GET /api/board after.
// /map?focus=site:site-57 opens with that item selected (the detail panel links here).
import { makeBoard } from "@/fixtures/board";
import { DeskMap } from "@/components/map/DeskMap";
import { getBoard } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function MapPage({ searchParams }: { searchParams: Promise<{ focus?: string | string[] }> }) {
  const { focus } = await searchParams;
  const f = typeof focus === "string" ? focus : undefined;
  try {
    // JSON round trip: the same shape the polls return (dates as ISO strings).
    const board = JSON.parse(JSON.stringify(await getBoard())) as ReturnType<typeof makeBoard>;
    return <DeskMap initial={board} initialLive focus={f} />;
  } catch (err) {
    console.error("map first paint: database not reachable, showing the fixture board:", err instanceof Error ? err.message : err);
    return <DeskMap initial={makeBoard(Date.now())} focus={f} />;
  }
}
