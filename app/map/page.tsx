// /map: sites and field problems on a map, USGS Latest Earthquakes layout.
// Polls GET /api/board. Until that route exists it shows the fixtures and says so.
// /map?focus=site:site-57 opens with that item selected (the detail panel links here).
import { makeBoard } from "@/fixtures/board";
import { DeskMap } from "@/components/map/DeskMap";

export const dynamic = "force-dynamic";

export default async function MapPage({ searchParams }: { searchParams: Promise<{ focus?: string | string[] }> }) {
  const { focus } = await searchParams;
  return <DeskMap initial={makeBoard(Date.now())} focus={typeof focus === "string" ? focus : undefined} />;
}
