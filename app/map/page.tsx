// /map: sites and field problems on a map, USGS Latest Earthquakes layout.
// Polls GET /api/board. Until that route exists it shows the fixtures and says so.
import { makeBoard } from "@/fixtures/board";
import { DeskMap } from "@/components/map/DeskMap";

export const dynamic = "force-dynamic";

export default function MapPage() {
  return <DeskMap initial={makeBoard(Date.now())} />;
}
