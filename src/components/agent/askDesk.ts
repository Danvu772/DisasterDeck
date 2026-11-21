// One natural-language question to the person's agent. Every screen that asks the agent goes through
// here, so the agents tab and the field phone get the same answer and the same charts:
// POST /api/chat, the reply or a readable error, then which metric cards and map pins the answer gets.
import { chatErrorText } from "../chatError";
import { pinIds } from "../metrics/MapCard";
import { pickMetrics } from "../metrics/useMetrics";
import type { MetricId } from "../metrics/types";

export interface DeskAnswer {
  reply: string;
  stub: boolean;          // the route was unreachable and `stub` wrote the reply
  ids: MetricId[];        // metric cards for the chart space
  pins: string[];         // records a map answer pins
}

/** `stub` writes the reply when /api/chat cannot be reached at all. A 502 is shown as what it is. */
export async function askDesk(userId: string, said: string, stub: () => string): Promise<DeskAnswer> {
  try {
    const r = await fetch(`/api/chat?user=${encodeURIComponent(userId)}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: said }),
    });
    const body: unknown = await r.json().catch(() => null);
    const got = (body as { reply?: unknown } | null)?.reply;
    const reply = r.ok && typeof got === "string" ? got : chatErrorText(r.ok ? 502 : r.status, body);
    // A map answer keeps only the charts the agent asked for, not the ones the question's words suggest.
    const pins = pinIds(body);
    return { reply, stub: false, ids: pickMetrics(pins.length ? "" : said, body), pins };
  } catch {
    return { reply: stub(), stub: true, ids: pickMetrics(said, null), pins: [] };
  }
}
