import type {
  AlertPayload, AnswerPayload, ApprovalPayload, CapacityPayload, ClosurePayload,
  Event, IncidentPayload, NeedPayload, ReportPayload,
} from "@/lib/types";
import { ageText } from "./encode";

// One entry per event, whatever the type. Who sent it, what came in, then what the desk did with it.
function summary(e: Event): { said: string; original?: string } {
  switch (e.type) {
    case "report": { const p = e.payload as ReportPayload; return { said: p.textEn, original: p.text }; }
    case "incident": { const p = e.payload as IncidentPayload; return { said: p.textEn, original: p.text }; }
    case "need": { const p = e.payload as NeedPayload; return { said: `Need ${p.quantity} ${p.item}${p.lifeThreatening ? ", life-threatening" : ""}` }; }
    case "capacity": { const p = e.payload as CapacityPayload; return { said: `${p.shelter}: ${p.bedsUsed}/${p.bedsTotal}` }; }
    case "closure": { const p = e.payload as ClosurePayload; return { said: `${p.road} ${p.state}: ${p.reason}` }; }
    case "answer": { const p = e.payload as AnswerPayload; return { said: p.note ?? p.result }; }
    case "approval": { const p = e.payload as ApprovalPayload; return { said: p.approved ? "Approved" : "Rejected" }; }
    case "alert": { const p = e.payload as AlertPayload; const zone = p.zoneId.charAt(0).toUpperCase() + p.zoneId.slice(1); const kind = p.kind.replaceAll("_", " "); return { said: `${kind.charAt(0).toUpperCase() + kind.slice(1)} in ${zone}` }; }
    default: return { said: e.type };
  }
}

export function EventRow({ e, now, actorName }: { e: Event; now: number; actorName: string }) {
  const s = summary(e);
  const waiting = e.status === "pending" || e.status === "working";
  return (
    <li className={`border-b border-line py-2 ${waiting ? "opacity-60" : ""}`}>
      <p className="text-xs text-muted">
        <span className="font-bold text-ink">{actorName}</span>, {e.type} from {e.source}, {ageText(e.ts, now)}
      </p>
      <p className="mt-0.5 text-sm">{s.said}</p>
      {s.original && <p className="text-xs text-muted">{s.original}</p>}
      <p className="mt-0.5 text-xs">
        {waiting ? <span className="text-muted">Status: {e.status}</span>
                 : <><span className="font-bold">Result:</span> {e.result?.reason ?? e.status}</>}
      </p>
    </li>
  );
}
