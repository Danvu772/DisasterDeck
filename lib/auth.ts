// Owned by Role 1. Who is calling? Decided by the server, never by the request body.
//
// Order:
// 1. `x-agent-key: <AGENT_KEY>`: a worker or the scenario player. It may name itself.
// 2. A login session (SSOJet through Auth.js, Role 3): see getSessionUserId().
// 3. `?user=<id>` only when DEMO_MODE=1 AND the request comes from this laptop (isLocalDemo).
//    Anything through a network, a tunnel or a proxy must sign in or carry the agent key (#11).
import { createHash, timingSafeEqual } from "node:crypto";
import { cols } from "./db";
import { isLocalDemo } from "./localDemo";
import { sessionUserId } from "../auth";
import type { User } from "./types";

export { isLocalDemo };

/** A shorter AGENT_KEY is guessable, so the server refuses to accept it at all. */
const MIN_AGENT_KEY = 24;

export type Caller =
  | { kind: "agent" }                  // trusted worker; the actor name comes from the body
  | { kind: "person"; user: User };    // a signed-in (or demo) person; the actor is user._id

export type CallerResult = { ok: true; caller: Caller } | { ok: false; status: 401 | 500; error: string };

function sameSecret(a: string, b: string): boolean {
  // Hash first so the comparison takes the same time whatever the lengths are.
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * The user id from the login session, or null.
 * The SSOJet session (Auth.js cookie), mapped to a desk user in /auth.ts (Role 3).
 */
async function getSessionUserId(req: Request): Promise<string | null> {
  void req; // Auth.js reads the session cookie from the request context itself
  try {
    return await sessionUserId();
  } catch (err) {
    // Called outside a Next request (npm run api:check calls the handler directly):
    // there is no cookie, so there is no session. Any other error is real: rethrow it.
    if (err instanceof Error && err.message.includes("outside a request scope")) return null;
    throw err;
  }
}

export async function resolveCaller(req: Request): Promise<CallerResult> {
  const key = req.headers.get("x-agent-key");
  if (key !== null) {
    const expected = process.env.AGENT_KEY;
    if (!expected) return { ok: false, status: 500, error: "AGENT_KEY is not set on the server" };
    if (expected.length < MIN_AGENT_KEY) return { ok: false, status: 500, error: "AGENT_KEY is too short" };
    if (!sameSecret(key, expected)) return { ok: false, status: 401, error: "wrong x-agent-key" };
    return { ok: true, caller: { kind: "agent" } };
  }

  let userId = await getSessionUserId(req);
  if (!userId) {
    if (!isLocalDemo(req)) return { ok: false, status: 401, error: "Sign in. Demo users work only on this laptop." };
    userId = new URL(req.url).searchParams.get("user");
  }
  if (!userId) return { ok: false, status: 401, error: "not signed in" };

  const { users } = await cols();
  const user = await users.findOne({ _id: userId });
  if (!user) return { ok: false, status: 401, error: `unknown user ${userId}` };
  return { ok: true, caller: { kind: "person", user } };
}

/**
 * May this request read the desk (board, event feed)? A local demo request (isLocalDemo) may, the
 * same rule middleware.ts uses for pages. Everyone else needs a login or the agent key.
 * Writing always goes through resolveCaller() and the rules in /api/events.
 */
export async function canRead(req: Request): Promise<{ ok: true } | { ok: false; status: 401 | 500; error: string }> {
  if (isLocalDemo(req) && !req.headers.has("x-agent-key")) return { ok: true };
  const who = await resolveCaller(req);
  return who.ok ? { ok: true } : who;
}
