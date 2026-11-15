import type { HistoryEntry } from "@/lib/types";
import { ageText } from "./encode";

// Who changed it, when, why. The name is the actor label.
export function History({ entries, now }: { entries: HistoryEntry[]; now: number }) {
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-primary underline">History ({entries.length})</summary>
      <ol className="mt-1 space-y-1 border-l border-line pl-3">
        {entries.map((h, i) => {
          return (
            <li key={i}>
              <span className="font-bold">{h.by}</span> <span className="text-muted">({ageText(h.ts, now)})</span>: {h.reason}
            </li>
          );
        })}
      </ol>
    </details>
  );
}
