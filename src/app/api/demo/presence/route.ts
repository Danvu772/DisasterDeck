// POST /api/demo/presence: the demo's heartbeat (D-0017 amendment 7). The player calls it every tick so
// the seeded people count as "seen" and the dispatcher picks them. Agent key only, demo deployments only.
// lastSeen is stamped on the demo clock (demoNow()), because the dispatcher measures "seen in the last
// 3 minutes" on it too (DEMO-4).
// Body { dark?: string[] }: those people are not stamped (a `go_dark` cast line). Only the ids in
// data/seed.json are ever stamped, never any other user. This route is the app's API, a legal writer
// of `users` (§4.2).
import { resolveCaller } from "@/lib/auth";
import { cols } from "@/lib/db";
import { demoNow } from "@/lib/demo";
import { isDemoDeployment } from "@/lib/pilot";
import seedFile from "@/data/seed.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (status: number, body: unknown) => Response.json(body, { status });

export async function POST(req: Request): Promise<Response> {
  try {
    const who = await resolveCaller(req);
    if (!who.ok) return json(who.status, { error: who.error });
    if (who.caller.kind !== "agent") return json(403, { error: "only the player (agent key) may send presence" });
    if (!isDemoDeployment()) return json(403, { error: "this deployment is not a demo" });

    let dark: string[] = [];
    const text = await req.text();
    if (text.trim()) {
      let raw: unknown;
      try { raw = JSON.parse(text); } catch { return json(400, { error: "body is not valid JSON" }); }
      const d = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as { dark?: unknown }).dark : undefined;
      if (d !== undefined) {
        if (!Array.isArray(d) || d.some((x) => typeof x !== "string")) return json(400, { error: "dark must be a list of user ids" });
        dark = d;
      }
    }

    const skip = new Set(dark);
    const ids = (seedFile.users as { _id: string }[]).map((u) => u._id).filter((id) => !skip.has(id));
    const { users } = await cols();
    const r = await users.updateMany({ _id: { $in: ids } }, { $set: { lastSeen: await demoNow() } });
    return json(200, { stamped: r.matchedCount });
  } catch (err) {
    console.error("POST /api/demo/presence failed:", err);
    return json(500, { error: "server error" });
  }
}
