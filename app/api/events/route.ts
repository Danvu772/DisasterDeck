// Owned by Role 1. POST /api/events: the HTTP door into the event queue.
// Body: an event without _id, status, ts, lane (Team contracts §4). Returns { id }.
// Posting the same dedupeKey again returns the first event's id, so retries are safe.
//
// The rules below are about the ACTOR, whichever way the request arrived (Team contracts §4,
// Final system design §9). State checks (is the task still waiting for approval?) are not done
// here: the Brain loop applies events one at a time and decides then, so nothing races.
import { resolveCaller } from "@/lib/auth";
import { cols, postEvent } from "@/lib/db";
import { eventBody, type EventBody } from "@/lib/schemas";
import type { User } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Denied = { status: 400 | 403 | 404; error: string };

function json(status: number, body: unknown): Response {
  return Response.json(body, { status });
}

export async function POST(req: Request): Promise<Response> {
  try {
    const who = await resolveCaller(req);
    if (!who.ok) return json(who.status, { error: who.error });
    const caller = who.caller;

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
