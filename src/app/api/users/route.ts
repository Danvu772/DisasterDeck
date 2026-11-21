// Owned by Role 1. GET /api/users: the people on a desk (G-04, issue #2), for the coordinator's
// person picker, Modify, and the coverage metric.
// Who may read it (D4): agents with the key and every role except citizens (role "public": 403).
// Only _id, name, role, region, status, coords and lastSeen leave the server. Never profile.
import { resolveCaller } from "@/lib/auth";
import { deskId, listUsers } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  try {
    const who = await resolveCaller(req);
    if (!who.ok) return Response.json({ error: who.error }, { status: who.status });
    if (who.caller.kind === "person" && who.caller.user.role === "public") {
      return Response.json({ error: "citizens do not see the people list" }, { status: 403 });
    }
    const desk = new URL(req.url).searchParams.get("desk") || deskId();
    return Response.json(await listUsers(desk), { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("GET /api/users failed:", err);
    return Response.json({ error: "server error" }, { status: 500 });
  }
}
