// Owned by Role 1. GET /api/board: everything the shared board shows, sorted by tier then
// priority, plus queue health. Same shape as fixtures/board.ts. Screens poll it every second.
// Speed (15 Nov): the encoded board is shared for BOARD_TTL_MS (lib/shared.ts), so N open screens
// cost one database read a second, not N.
import { canRead } from "@/lib/auth";
import { deskId } from "@/lib/db";
import { boardJson } from "@/lib/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const access = await canRead(req);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  try {
    const desk = new URL(req.url).searchParams.get("desk") || deskId();
    return new Response(await boardJson(desk), {
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (err) {
    console.error("GET /api/board failed:", err);
    return Response.json({ error: "server error" }, { status: 500 });
  }
}
