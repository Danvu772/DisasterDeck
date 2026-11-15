import type { HistoryEntry } from "@/lib/types";
import { ageText } from "./encode";

// Who changed it, when, from which source, why. Machine lines are mono, people are sans.
export function History({ entries, now }: { entries: HistoryEntry[]; now: number }) {
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-muted">history ({entries.length})</summary>
      <ol className="mt-1 space-y-1 border-l border-line pl-3">
        {entries.map((h, i) => {
          const machine = h.source !== "person";
          return (
            <li key={i} className={machine ? "font-mono" : ""}>
              <span className="text-muted">{ageText(h.ts, now)} · {h.by}</span> {h.reason}
            </li>
          );
        })}
      </ol>
    </details>
  );
}
