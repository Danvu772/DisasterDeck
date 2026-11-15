// Owned by Role 1. GET /api/health: is the Brain alive? Open to everyone: it shows only counts.
// A growing `pending` count with an old `lastLoopAt` means the Brain loop is not running.
import { getHealth } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    return Response.json(await getHealth(), { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("GET /api/health failed:", err);
    return Response.json({ error: "server error" }, { status: 500 });
  }
}
