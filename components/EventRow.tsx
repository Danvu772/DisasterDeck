import type {
  AlertPayload, AnswerPayload, ApprovalPayload, CapacityPayload, ClosurePayload,
  Event, IncidentPayload, NeedPayload, ReportPayload,
} from "@/lib/types";
import { ageText } from "./encode";

// One line per event, whatever the type. What came in (sans if a person said it, mono if a
// machine did), then what the desk turned it into.
function summary(e: Event): { said: string; original?: string } {
  switch (e.type) {
    case "report": { const p = e.payload as ReportPayload; return { said: p.textEn, original: p.text }; }
    case "incident": { const p = e.payload as IncidentPayload; return { said: p.textEn, original: p.text }; }
    case "need": { const p = e.payload as NeedPayload; return { said: `Need ${p.quantity} ${p.item}${p.lifeThreatening ? ", life-threatening" : ""}` }; }
    case "capacity": { const p = e.payload as CapacityPayload; return { said: `${p.shelter}: ${p.bedsUsed}/${p.bedsTotal}` }; }
    case "closure": { const p = e.payload as ClosurePayload; return { said: `${p.road} ${p.state}: ${p.reason}` }; }
    case "answer": { const p = e.payload as AnswerPayload; return { said: p.note ?? p.result }; }
    case "approval": { const p = e.payload as ApprovalPayload; return { said: p.approved ? "Approved" : "Rejected" }; }
    case "alert": { const p = e.payload as AlertPayload; return { said: `${p.kind.replace("_", " ")} in ${p.zoneId}` }; }
    default: return { said: e.type };
  }
}

export function EventRow({ e, now, actorName }: { e: Event; now: number; actorName: string }) {
  const s = summary(e);
  const person = e.source === "person";
  const waiting = e.status === "pending" || e.status === "working";
  return (
    <li className={`border-b border-line py-2 ${waiting ? "opacity-60" : ""}`}>
      <p className="font-mono text-xs text-muted">
        {e.type} · {actorName} · {e.source} · {ageText(e.ts, now)}
      </p>
      <p className={`mt-0.5 text-sm ${person ? "" : "font-mono"}`}>{s.said}</p>
      {s.original && <p className="text-xs italic text-muted">{s.original}</p>}
      <p className="mt-0.5 font-mono text-xs">
        {waiting ? <span className="text-muted">… {e.status}</span> : <>→ {e.result?.reason ?? e.status}</>}
      </p>
    </li>
  );
}
