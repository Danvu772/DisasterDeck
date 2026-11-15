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
import { deskId } from "@/lib/db";
import { boardJson, sharedUsers } from "@/lib/shared";

export const dynamic = "force-dynamic";

// A fixed file: read it once per process, not once per page load.
let quakeList: Promise<GlQuake[]> | undefined;
function quakes(): Promise<GlQuake[]> {
  return (quakeList ??= readQuakes());
}

async function readQuakes(): Promise<GlQuake[]> {
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
    // The board and the names side by side, both shared with the polls (lib/shared.ts).
    // A failure of the names only costs the names, not the map.
    const [json, people] = await Promise.all([boardJson(deskId()), sharedUsers(deskId()).catch(() => [])]);
    const board = JSON.parse(json) as ReturnType<typeof makeBoard>; // same shape the polls return
    const names = Object.fromEntries(people.map((u) => [u._id, u.name]));
    return <MapScreen initial={board} initialLive focus={f} quakes={q} names={names} />;
  } catch (err) {
    console.error("map first paint: database not reachable, showing the fixture board:", err instanceof Error ? err.message : err);
    return <MapScreen initial={makeBoard(Date.now())} focus={f} quakes={q} />;
  }
}
