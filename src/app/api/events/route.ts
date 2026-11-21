// Owned by Role 1. The HTTP door into the event queue.
// POST: body is an event without _id, status, ts, lane (Team contracts §4). Returns { id }.
//       Posting the same dedupeKey again returns the first event's id, so retries are safe.
// GET:  the desk feed. ?since=<ISO time or epoch ms> → events received after it, oldest first.
//
// The POST rules are about the ACTOR, whichever way the request arrived (Team contracts §4,
// Final system design §9). State checks (is the task still waiting for approval?) are not done
// here: the Brain loop applies events one at a time and decides then, so nothing races.
import { canRead, resolveCaller } from "@/lib/auth";
import { cols, deskId, postEvent } from "@/lib/db";
import { FEED_PROJECTION, latestFeed, maskEvent } from "@/lib/feed";
import { eventBody, type EventBody } from "@/lib/schemas";
import type { User } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Denied = { status: 400 | 403 | 404; error: string };

function json(status: number, body: unknown): Response {
  return Response.json(body, { status });
}

// Small in-memory rate limit per person, same style as /api/chat. The agent key is not limited:
// the scenario player and the workers post in bursts on purpose.
const POSTS_PER_MINUTE = 60;
const g = globalThis as unknown as { __eventHits?: Map<string, number[]> };
const hits: Map<string, number[]> = (g.__eventHits ??= new Map<string, number[]>());
function limited(key: string): boolean {
  const now = Date.now();
  const xs = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  const over = xs.length >= POSTS_PER_MINUTE;
  if (!over) xs.push(now);
  hits.set(key, xs);
  return over;
}

const FEED_DEFAULT = 50;
const FEED_MAX = 500;

export async function GET(req: Request): Promise<Response> {
  const access = await canRead(req);
  if (!access.ok) return json(access.status, { error: access.error });

  const q = new URL(req.url).searchParams;
  const limitRaw = q.get("limit");
  const limit = limitRaw === null ? FEED_DEFAULT : Number(limitRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > FEED_MAX) {
    return json(400, { error: `limit must be a whole number from 1 to ${FEED_MAX}` });
  }
  const sinceRaw = q.get("since");
  let since: Date | undefined;
  if (sinceRaw !== null) {
    since = /^\d+$/.test(sinceRaw) ? new Date(Number(sinceRaw)) : new Date(sinceRaw);
    if (Number.isNaN(since.getTime())) return json(400, { error: "since must be an ISO time or epoch milliseconds" });
  }

  try {
    const { events } = await cols();
    const desk = q.get("desk") || deskId();
    const masked = since
      // Everything after `since`, oldest first, so a client can keep the last ts and ask again.
      ? (await events.find({ deskId: desk, ts: { $gt: since } }, { projection: FEED_PROJECTION }).sort({ ts: 1 }).limit(limit).toArray()).map(maskEvent)
      // No `since`: the latest events, still returned oldest first.
      : await latestFeed(limit, desk);
    return Response.json(masked, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("GET /api/events failed:", err);
    return json(500, { error: "server error" });
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const who = await resolveCaller(req);
    if (!who.ok) return json(who.status, { error: who.error });
    const caller = who.caller;
    if (caller.kind === "person" && limited(caller.user._id)) {
      return json(429, { error: "too many posts, wait a minute" });
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return json(400, { error: "body is not valid JSON" });
    }
    const parsed = eventBody.safeParse(raw);
    if (!parsed.success) {
      return json(400, {
        error: "invalid event",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    const body = parsed.data;

    // The server decides who the actor is. A person can never post as someone else.
    const actor = caller.kind === "person" ? caller.user._id : body.actor || `${body.source}-agent`;
    const denied = await authorize(body, caller.kind, actor, caller.kind === "person" ? caller.user : null);
    if (denied) return json(denied.status, { error: denied.error });

    const id = await postEvent({
      type: body.type,
      source: body.source,
      actor,
      payload: body.payload,
      deskId: body.deskId ?? (caller.kind === "person" ? caller.user.deskId : undefined),
      observedAt: body.observedAt,
      dedupeKey: body.dedupeKey,
      origin: body.origin,
    });
    return json(200, { id });
  } catch (err) {
    console.error("POST /api/events failed:", err);
    return json(500, { error: "server error, safe to retry with the same dedupeKey" });
  }
}

async function authorize(
  e: EventBody, kind: "agent" | "person", actor: string, person: User | null,
): Promise<Denied | null> {
  if (kind === "person") {
    if (e.source !== "person") {
      return { status: 403, error: `a signed-in person posts with source "person", not "${e.source}"` };
    }
    if (e.type === "need") {
      return { status: 403, error: "needs are filed through your agent (/api/chat), not posted directly" };
    }
    if (e.type === "alert" || e.type === "plan") {
      return { status: 403, error: `${e.type} events come from the satellite watcher or the planner only` };
    }
  }

  // A social post alone never approves, cancels or corrects anything.
  if ((e.type === "approval" || e.type === "answer" || e.type === "correction") && e.source !== "person") {
    return { status: 403, error: `${e.type} events must come from a person (source "person")` };
  }

  if (e.type === "approval" || e.type === "answer" || (e.type === "incident" && e.payload.taskId)) {
    const { tasks, users } = await cols();
    const taskId = e.payload.taskId!;
    const task = await tasks.findOne({ _id: taskId }, { projection: { assignee: 1 } });
    if (!task) return { status: 404, error: `task ${taskId} not found` };
    const user = person ?? (await users.findOne({ _id: actor }));

    if (e.type === "approval" && user?.role !== "coordinator") {
      return { status: 403, error: "only a coordinator can approve" };
    }
    if (e.type === "answer" && task.assignee !== actor) {
      return { status: 403, error: "only the person the task is assigned to can answer it" };
    }
    if (e.type === "incident" && kind === "person" && task.assignee !== actor && user?.role !== "coordinator") {
      return { status: 403, error: "only the assignee or a coordinator can report a problem on this task" };
    }
  }
  return null;
}
