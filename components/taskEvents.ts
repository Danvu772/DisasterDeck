// Pure adapter from a task button press to the POST /api/events body (see lib/schemas.ts).
import type { LatLng } from "@/lib/types";

export type TaskAction = "accepted" | "declined" | "done" | "problem";
export type ProblemKind = "vehicle_breakdown" | "road_blocked" | "cannot_find" | "other";

export const problemChoices: { kind: ProblemKind; label: string; text: string; textEn: string }[] = [
  { kind: "vehicle_breakdown", label: "Vehicle", text: "Vehicle problem", textEn: "Vehicle problem" },
  { kind: "road_blocked", label: "Road blocked", text: "Road blocked", textEn: "Road blocked" },
  { kind: "cannot_find", label: "Can't find it", text: "Can't find it", textEn: "Can't find the location" },
  { kind: "other", label: "Other", text: "Other problem", textEn: "Other problem" },
];

export function taskEventBody(taskId: string, a: TaskAction, kind: ProblemKind = "other", coords?: LatLng) {
  if (a !== "problem") {
    return { type: "answer" as const, source: "person" as const, payload: { taskId, result: a } };
  }
  const c = problemChoices.find((p) => p.kind === kind) ?? problemChoices[3];
  return {
    type: "incident" as const, source: "person" as const,
    payload: { kind: c.kind, text: c.text, textEn: c.textEn, taskId, canContinue: false, ...(coords && { coords }) },
  };
}

// Browser position, or undefined after 3 s or when the browser says no.
export function getCoords(): Promise<LatLng | undefined> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(undefined);
    const t = setTimeout(() => resolve(undefined), 3000);
    navigator.geolocation.getCurrentPosition(
      (p) => { clearTimeout(t); resolve([p.coords.latitude, p.coords.longitude]); },
      () => { clearTimeout(t); resolve(undefined); },
      { timeout: 3000 },
    );
  });
}

// What the card says after the post. 400, 403 and 404 carry the server's own words.
export async function sendTaskEvent(userId: string, body: object): Promise<string> {
  try {
    const r = await fetch(`/api/events?user=${encodeURIComponent(userId)}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    if (r.ok) return "Sent";
    if (r.status === 400 || r.status === 403 || r.status === 404) {
      const j = await r.json().catch(() => null);
      const e = typeof j?.error === "string" ? j.error : `Not sent, the desk said ${r.status}`;
      const first = Array.isArray(j?.issues) ? j.issues[0] : null;
      return first ? `${e}, ${first.path} ${first.message}` : e;
    }
    return "Not sent, the desk is offline";
  } catch {
    return "Not sent, the desk is offline";
  }
}
