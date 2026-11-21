// Owned by Role 1. GET /api/health: is the Brain alive? Open to everyone: it shows only counts,
// plus `model`, the host and model ids the agents call (lib/health-body.ts; nothing secret).
// A growing `pending` count with an old `lastLoopAt` means the Brain loop is not running.
import { healthBody, modelBlock } from "@/lib/health-body";
import { shared } from "@/lib/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    return Response.json(await shared("health", 2000, () => healthBody()), { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("GET /api/health failed:", err);
    return Response.json({ error: "server error", model: modelBlock() }, { status: 500 });
  }
}
