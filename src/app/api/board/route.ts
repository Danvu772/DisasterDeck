// Owned by Role 1. GET /api/board: everything the shared board shows, sorted by tier then
// priority, plus queue health. Same shape as fixtures/board.ts. Screens poll it every second.
// Speed (15 Nov): the encoded board is shared for BOARD_TTL_MS (lib/shared.ts), so N open screens
// cost one database read a second, not N.
import { canRead } from "@/lib/auth";
import { deskId } from "@/lib/db";
import { demoNowFrom, getDemo } from "@/lib/demo";
import { boardJson } from "@/lib/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const access = await canRead(req);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  try {
    const desk = new URL(req.url).searchParams.get("desk") || deskId();
    // The demo state and clock are read fresh: the board copy above may be seconds old.
    const demo = await getDemo();
    const extra = JSON.stringify({
      demo: demo?.state === "playing"
        ? { state: "playing", startedAt: demo.startedAt, durationS: demo.durationS }
        : demo ? { state: demo.state, startedAt: null, durationS: null } : null,
      demoNow: demoNowFrom(demo),
    });
    const board = await boardJson(desk);
    return new Response(`${board.slice(0, -1)},${extra.slice(1)}`, {
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (err) {
    console.error("GET /api/board failed:", err);
    return Response.json({ error: "server error" }, { status: 500 });
  }
}
