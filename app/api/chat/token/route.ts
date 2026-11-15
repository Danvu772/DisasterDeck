// GET /api/chat/token: a single-use ElevenLabs token for live transcription on /talk.
// The browser streams the microphone straight to Scribe realtime with it, so the words show
// while the person speaks and the text is ready the moment they let go. Owner: Role 2.
// Same "who is talking" rule as POST /api/chat: the login, or ?user= on this laptop in demo mode.
import { NextResponse } from "next/server";
import { desk } from "@/agents/desk";
import { LIVE_STT_MODEL, realtimeToken, voiceEnabled } from "@/agents/shared/voice";
import { sessionUserId } from "@/auth";
import { isLocalDemo } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!voiceEnabled()) return NextResponse.json({ error: "no live voice on this server" }, { status: 404 });
  let userId = await sessionUserId();
  if (!userId) {
    userId = new URL(req.url).searchParams.get("user");
    if (!userId || !isLocalDemo(req)) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  if (!(await desk().getUser(userId))) return NextResponse.json({ error: `unknown user ${userId}` }, { status: 404 });
  try {
    return NextResponse.json({ token: await realtimeToken(), modelId: LIVE_STT_MODEL }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("[api/chat/token]", e);
    return NextResponse.json({ error: "could not get a live voice token" }, { status: 502 });
  }
}
