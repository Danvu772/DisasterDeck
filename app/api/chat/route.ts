// POST /api/chat — one turn with the person's own agent. Owner: Role 2.
// Body: { text?, imageBase64?, audioBase64?, coords? } → { reply, eventIds, actions }
// Who is talking: the login, once SSOJet is in. Until then ?user=<id> (or body.userId),
// accepted only when DEMO_MODE=1. Anyone who can reach the server can then talk as anyone,
// so keep DEMO_MODE off on a public URL once login works.
// Voice: Claude has no speech-to-text. The browser turns speech into text (Web Speech API)
// and sends it as `text`. A raw audioBase64 gets a polite reply, not an error.

import { NextResponse } from "next/server";
import { runTurn, type TurnInput } from "@/agents/personal/turn";
import { desk } from "@/agents/desk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TEXT = 4000;
const MAX_IMAGE_BASE64 = 5 * 1024 * 1024; // the API's 5 MB image limit applies to the base64 data
const demoAllowed = () => process.env.DEMO_MODE === "1";

// Small in-memory rate limit: protects the $20 key from a stuck client or a curious visitor.
const PER_MINUTE = 8;
const PER_HOUR = 80;
const g = globalThis as unknown as { __chatHits?: Map<string, number[]> };
const hits: Map<string, number[]> = (g.__chatHits ??= new Map<string, number[]>());
function limited(key: string): boolean {
  const now = Date.now();
  const xs = (hits.get(key) ?? []).filter((t) => now - t < 3600_000);
  if (xs.filter((t) => now - t < 60_000).length >= PER_MINUTE || xs.length >= PER_HOUR) {
    hits.set(key, xs);
    return true;
  }
  xs.push(now);
  hits.set(key, xs);
  return false;
}

/** Media type from the first bytes, not from what the client claims. */
function sniff(base64: string): NonNullable<TurnInput["image"]>["mediaType"] | undefined {
  if (base64.startsWith("/9j/")) return "image/jpeg";
  if (base64.startsWith("iVBOR")) return "image/png";
  if (base64.startsWith("R0lGOD")) return "image/gif";
  if (base64.startsWith("UklGR")) return "image/webp";
  return undefined;
}

interface Body {
  userId?: unknown;
  text?: unknown;
  imageBase64?: unknown;
  audioBase64?: unknown;
  coords?: unknown;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }

  const userId = new URL(req.url).searchParams.get("user") ?? (typeof body.userId === "string" ? body.userId : null);
  if (!userId) return NextResponse.json({ error: "who is talking? (login, or ?user= in demo mode)" }, { status: 401 });
  if (!demoAllowed()) return NextResponse.json({ error: "?user= works only with DEMO_MODE=1" }, { status: 401 });
  if (!(await desk().getUser(userId))) return NextResponse.json({ error: `unknown user ${userId}` }, { status: 404 });

  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  if (limited(`${ip}|${userId}`)) {
    return NextResponse.json({ error: "too many messages, wait a minute" }, { status: 429 });
  }

  const text = typeof body.text === "string" ? body.text.slice(0, MAX_TEXT) : undefined;
  if (!text && body.audioBase64 && !body.imageBase64) {
    return NextResponse.json({
      reply: "I can't listen to audio files yet. Hold the mic button so your phone types what you say, or write it.",
      eventIds: [], actions: [],
    });
  }

  let image: TurnInput["image"];
  if (body.imageBase64 !== undefined) {
    if (typeof body.imageBase64 !== "string") return NextResponse.json({ error: "imageBase64 must be a string" }, { status: 400 });
    const base64 = body.imageBase64.replace(/^data:[^;,]*;base64,/, "").replace(/\s/g, "");
    if (base64.length > MAX_IMAGE_BASE64) {
      return NextResponse.json({ error: "photo too large: send at most about 3.5 MB (resize to 1568 px on the long side)" }, { status: 413 });
    }
    const mediaType = sniff(base64);
    if (!mediaType) return NextResponse.json({ error: "photo must be JPEG, PNG, WebP or GIF" }, { status: 415 });
    image = { mediaType, base64 };
  }

  const c = body.coords;
  const coords = Array.isArray(c) && c.length === 2 && c.every((x) => typeof x === "number" && Number.isFinite(x))
    ? (c as [number, number]) : undefined;

  try {
    const result = await runTurn({ userId, text, image, coords });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[api/chat]", e);
    return NextResponse.json({ error: "the agent failed this turn, try again" }, { status: 502 });
  }
}
