// /map: every place the desk knows about on the MapLibre map, plus the NASA imagery view.
// Polls GET /api/board; until it answers it shows the fixtures. /map?focus=site:site-57 opens on that record.
// Quakes: the USGS Kahramanmaraş 2023 sequence (M4+), cached in agents/fixtures for offline demos.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { makeBoard } from "@/fixtures/board";
import { MapScreen } from "@/components/map/MapScreen";
import type { GlQuake } from "@/components/map/gl/DeskGlMap";

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
  return <MapScreen initial={makeBoard(Date.now())} focus={typeof focus === "string" ? focus : undefined} quakes={await quakes()} />;
}
