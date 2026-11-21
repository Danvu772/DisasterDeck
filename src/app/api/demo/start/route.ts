// POST /api/demo/start: start (or restart) the one global demo (D-0017).
// Only a signed-in coordinator, only on a demo deployment (D-0017 amendment 8): it wipes the whole
// database, so a volunteer or supplier on the public demo site must not. An agent key, a timer or a worker cannot.
// The route preps Mongo itself (startDemo in lib/demo.ts) and is the only writer of meta "demo".
import { resolveCaller } from "@/lib/auth";
import { DemoBusyError, MAX_DURATION_S, MIN_DURATION_S, startDemo } from "@/lib/demo";
import { isDemoDeployment } from "@/lib/pilot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (status: number, body: unknown) => Response.json(body, { status });

export async function POST(req: Request): Promise<Response> {
  try {
    const who = await resolveCaller(req);
    if (!who.ok) return json(who.status, { error: who.error });
    if (who.caller.kind !== "person") return json(403, { error: "only a signed-in person can start the demo" });
    if (who.caller.user.role !== "coordinator") return json(403, { error: "only a coordinator can start the demo" });
    if (!isDemoDeployment()) return json(403, { error: "this deployment is not a demo" });

    let durationS: number | undefined;
    const text = await req.text();
    if (text.trim()) {
      let raw: unknown;
      try { raw = JSON.parse(text); } catch { return json(400, { error: "body is not valid JSON" }); }
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return json(400, { error: "body must be an object" });
      const d = (raw as { durationS?: unknown }).durationS;
      if (d !== undefined) {
        if (typeof d !== "number" || !Number.isFinite(d) || d < MIN_DURATION_S || d > MAX_DURATION_S) {
          return json(400, { error: `durationS must be a number from ${MIN_DURATION_S} to ${MAX_DURATION_S}` });
        }
        durationS = d;
      }
    }

    const { runId, startedAt } = await startDemo({ durationS });
    return json(200, { runId, startedAt: startedAt.toISOString() });
  } catch (err) {
    if (err instanceof DemoBusyError) return json(409, { error: err.message });
    console.error("POST /api/demo/start failed:", err);
    return json(500, { error: "server error" });
  }
}
