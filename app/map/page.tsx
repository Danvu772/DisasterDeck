// /map: every place the desk knows about on the MapLibre map, plus the NASA imagery view.
// The server reads the board from the database, so the first paint is the real desk. Only when the
// database cannot be reached does it start from the fixture board. Polls GET /api/board after.
// /map?focus=site:site-57 opens on that record.
// Quakes: the USGS Kahramanmaraş 2023 sequence (M4+), cached in agents/fixtures for offline demos.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { makeBoard } from "@/fixtures/board";
import { MapScreen } from "@/components/map/MapScreen";
import type { GlQuake } from "@/components/map/gl/DeskGlMap";
import { getBoard, listUsers } from "@/lib/db";

export const dynamic = "force-dynamic";

async function quakes(): Promise<GlQuake[]> {
  try {
    const raw = JSON.parse(await readFile(path.join(process.cwd(), "agents", "fixtures", "usgs-kahramanmaras-2023.json"), "utf8"));
    return (raw.events as GlQuake[]).map(({ id, lat, lon, mag, time, place }) => ({ id, lat, lon, mag, time, place }));
  } catch {
    return [];
  }
}

export default async function MapPage({ searchParams }: { searchParams: Promise<{ focus?: string | string[] }> }) {
  const { focus } = await searchParams;
  const f = typeof focus === "string" ? focus : undefined;
  const q = await quakes();
  try {
    // JSON round trip: the same shape the polls return (dates as ISO strings).
    const board = JSON.parse(JSON.stringify(await getBoard())) as ReturnType<typeof makeBoard>;
    // Names for "Verified by …" in the site cards. A failure only costs the names, not the map.
    const names = Object.fromEntries((await listUsers().catch(() => [])).map((u) => [u._id, u.name]));
    return <MapScreen initial={board} initialLive focus={f} quakes={q} names={names} />;
  } catch (err) {
    console.error("map first paint: database not reachable, showing the fixture board:", err instanceof Error ? err.message : err);
    return <MapScreen initial={makeBoard(Date.now())} focus={f} quakes={q} />;
  }
}
