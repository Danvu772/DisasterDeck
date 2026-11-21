// Owned by #10 (WS-3). GET /api/contacts: the desk's help directory (D-0009).
// Static per desk, read only. ?kind=vehicle_breakdown|short_supply narrows it to the contacts an
// incident needs (tow, tire, fuel, pharmacy); ?text= helps short_supply match what is short.
// Who may read it: anyone signed in or an agent (the directory is services, not people).

import { resolveCaller } from "@/lib/auth";
import { contactsFor, contactsForIncident } from "@/lib/contacts";
import { deskId } from "@/lib/db";
import type { IncidentKind } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INCIDENT_KINDS: IncidentKind[] = ["vehicle_breakdown", "short_supply"];

export async function GET(req: Request): Promise<Response> {
  try {
    const who = await resolveCaller(req);
    if (!who.ok) return Response.json({ error: who.error }, { status: who.status });

    const q = new URL(req.url).searchParams;
    const desk = q.get("desk") || deskId();
    const kind = q.get("kind");
    const text = q.get("text") ?? "";

    const contacts = kind && INCIDENT_KINDS.includes(kind as IncidentKind)
      ? contactsForIncident(desk, kind as IncidentKind, text)
      : contactsFor(desk);

    return Response.json({ desk, contacts }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("GET /api/contacts failed:", err);
    return Response.json({ error: "server error" }, { status: 500 });
  }
}
