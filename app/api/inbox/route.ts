// Owned by Role 1. The caller's inbox (G-03, issue #1).
// GET:  the caller's unread items, newest first (at most 100). Stamps the caller's lastSeen.
// POST: { ids?: string[] } marks those ids read, or every unread item when ids is missing.
//       Only the caller's own items. Returns { read: n }.
// An inbox belongs to a person, so an agent key gets 400.
import { resolveCaller } from "@/lib/auth";
import { cols, getInbox } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IDS = 500;

function json(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

async function person(req: Request): Promise<{ userId: string } | Response> {
  const who = await resolveCaller(req);
  if (!who.ok) return json(who.status, { error: who.error });
  if (who.caller.kind !== "person") return json(400, { error: "an inbox belongs to a person, an agent has none" });
  return { userId: who.caller.user._id };
}

export async function GET(req: Request): Promise<Response> {
  try {
    const p = await person(req);
    if (p instanceof Response) return p;
    const { users } = await cols();
    // Polled every few seconds by the person's screen, so this doubles as "is this person there?"
    await users.updateOne({ _id: p.userId }, { $set: { lastSeen: new Date() } });
    return json(200, await getInbox(p.userId));
  } catch (err) {
    console.error("GET /api/inbox failed:", err);
    return json(500, { error: "server error" });
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const p = await person(req);
    if (p instanceof Response) return p;

    // An empty body means "mark everything read".
    const text = await req.text();
    let body: unknown = {};
    if (text.trim()) {
      try {
        body = JSON.parse(text);
      } catch {
        return json(400, { error: "body is not valid JSON" });
      }
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json(400, { error: "body must be an object" });
    const ids = (body as { ids?: unknown }).ids;
    if (ids !== undefined && (!Array.isArray(ids) || ids.length > MAX_IDS || ids.some((i) => typeof i !== "string"))) {
      return json(400, { error: `ids must be a list of up to ${MAX_IDS} strings` });
    }

    const { inbox } = await cols();
    const r = await inbox.updateMany(
      { userId: p.userId, status: "unread", ...(ids ? { _id: { $in: ids as string[] } } : {}) },
      { $set: { status: "read" } },
    );
    return json(200, { read: r.modifiedCount });
  } catch (err) {
    console.error("POST /api/inbox failed:", err);
    return json(500, { error: "server error" });
  }
}
