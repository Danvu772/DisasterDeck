import { ChevronRight } from "lucide-react";
import type { HistoryEntry } from "@/lib/types";
import { actorLabel } from "./detail/fields";
import { ageText } from "./encode";

// Who changed it, when, why. Folded by default, newest first, as a quiet timeline.
export function History({ entries, now }: { entries: HistoryEntry[]; now: number }) {
  const list = [...entries].sort((a, b) => +new Date(b.ts) - +new Date(a.ts));
  return (
    <details className="group mt-3 text-xs">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden />
        History <span className="font-mono">{entries.length}</span>
      </summary>
      <ol className="mt-2 space-y-2.5 border-l pl-3.5">
        {list.map((h, i) => (
          <li key={i} className="relative">
            <span aria-hidden className="absolute -left-[18px] top-1.5 size-1.5 rounded-full bg-border ring-2 ring-card" />
            <p className="text-foreground">{h.reason}</p>
            <p className="text-muted-foreground">
              {actorLabel(h.by)} · <span suppressHydrationWarning>{ageText(h.ts, now)}</span>
            </p>
          </li>
        ))}
      </ol>
    </details>
  );
}
