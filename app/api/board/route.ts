// Owned by Role 1. GET /api/board: everything the shared board shows, sorted by tier then
// priority, plus queue health. Same shape as fixtures/board.ts. Screens poll it every second.
import { canRead } from "@/lib/auth";
import { deskId, getBoard } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const access = await canRead(req);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  try {
    const desk = new URL(req.url).searchParams.get("desk") || deskId();
    return Response.json(await getBoard(desk), { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("GET /api/board failed:", err);
    return Response.json({ error: "server error" }, { status: 500 });
  }
}
