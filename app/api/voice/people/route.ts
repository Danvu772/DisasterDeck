import { listPublicUpdates } from "@/lib/family-voice";
import { voiceJson } from "@/lib/voice-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Published family updates are public. No account, reference entry or PIN is required.
export async function GET() {
  try { return voiceJson({ people: await listPublicUpdates() }); }
  catch { return voiceJson({ error: "Published updates are currently unavailable. Please try again." }, 503); }
}
