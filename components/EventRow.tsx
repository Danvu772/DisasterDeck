import {
  BedDouble, CheckCheck, Construction, Hand, LoaderCircle, type LucideIcon, MessageSquare, Package, PencilLine,
  Route, Satellite, ShieldCheck, TriangleAlert,
} from "lucide-react";
import { motion } from "motion/react";
import type {
  AlertPayload, AnswerPayload, ApprovalPayload, CapacityPayload, ClosurePayload,
  Event, EventType, IncidentPayload, NeedPayload, ReportPayload,
} from "@/lib/types";
import { actorLabel, statusWord } from "./detail/fields";
import { ageText } from "./encode";

export const EVENT_ICON: Record<EventType, LucideIcon> = {
  report: MessageSquare, need: Package, closure: Construction, capacity: BedDouble, answer: CheckCheck,
  approval: ShieldCheck, alert: Satellite, incident: TriangleAlert, claim: Hand, correction: PencilLine, plan: Route,
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const ANSWER_WORD = { accepted: "Accepted the task", declined: "Declined the task", done: "Finished the task" } as const;

// Client only (motion): imported by the feed, the agent screen and the event report.
// One line per event, whatever the type: what came in, in English, plus the original when there is one.
export function summary(e: Event): { said: string; original?: string } {
  switch (e.type) {
    case "report": { const p = e.payload as ReportPayload; return { said: p.textEn, original: p.text !== p.textEn ? p.text : undefined }; }
    case "incident": { const p = e.payload as IncidentPayload; return { said: p.textEn, original: p.text !== p.textEn ? p.text : undefined }; }
    case "need": { const p = e.payload as NeedPayload; return { said: `Needs ${p.quantity} ${p.item}${p.lifeThreatening ? ", life-threatening" : ""}` }; }
    case "capacity": { const p = e.payload as CapacityPayload; return { said: `${p.shelter}: ${p.bedsUsed} of ${p.bedsTotal} beds used` }; }
    case "closure": { const p = e.payload as ClosurePayload; return { said: `${p.road} ${statusWord(p.state).toLowerCase()}: ${p.reason}` }; }
    case "answer": { const p = e.payload as AnswerPayload; return { said: p.note ?? ANSWER_WORD[p.result] ?? cap(p.result) }; }
    case "approval": { const p = e.payload as ApprovalPayload; return { said: p.approved ? "Approved the task" : "Rejected the task" }; }
    case "alert": {
      const p = e.payload as AlertPayload;
      const zone = cap(p.zoneId.replaceAll(/[-_]/g, " "));
      return { said: `${p.kind === "cold" ? "Cold zone" : "Silent zone"} in ${zone}` };
    }
    default: return { said: cap(e.type) };
  }
}

// What the desk did with it, in two or three words.
export function outcome(e: Pick<Event, "status">): string {
  switch (e.status) {
    case "pending": case "working": return "Processing";
    case "done": return "On the board";
    case "merged": return "Merged with an earlier report";
    case "rejected": return "Not used";
    case "failed": return "Needs a person";
  }
}

export function EventRow({ e, now, actorName, onOpen, demo }: { e: Event & { _id?: string }; now: number; actorName: string; onOpen: () => void; demo?: boolean }) {
  const s = summary(e);
  const waiting = !demo && (e.status === "pending" || e.status === "working");
  const Icon = EVENT_ICON[e.type] ?? MessageSquare;
  const failed = e.status === "failed";
  return (
    <motion.li layout="position" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 36 }}>
      <button type="button" onClick={onOpen}
        className="flex w-full cursor-pointer gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-secondary/70 focus-visible:bg-secondary/70">
        <span aria-hidden className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${
          e.type === "incident" || failed ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground"}`}>
          <Icon className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="truncate text-sm font-medium">{actorLabel(actorName)}</span>
            <span className="ml-auto shrink-0 text-xs text-muted-foreground" suppressHydrationWarning>{ageText(e.ts, now)}</span>
          </span>
          <span className="line-clamp-2 text-sm text-foreground/80">{s.said}</span>
          <span className={`mt-0.5 inline-flex items-center gap-1 text-xs ${failed ? "text-destructive" : "text-muted-foreground"}`}>
            {demo ? "Demo, nothing reached the desk"
              : waiting ? <><LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" aria-hidden />Processing</>
                : outcome(e)}
          </span>
        </span>
      </button>
    </motion.li>
  );
}
