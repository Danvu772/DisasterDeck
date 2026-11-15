import type { Tone } from "../types";
import { toneBg } from "./tone";

export function Snapshot({ rows }: { rows: { label: string; value: string; tone?: Tone }[] }) {
  return (
    <dl className="divide-y text-sm">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
          <dt className="flex items-center gap-2 text-muted-foreground">
            <span aria-hidden className={`size-2 shrink-0 rounded-full ${r.tone ? toneBg(r.tone) : "bg-border"}`} />
            {r.label}
          </dt>
          <dd className="text-right font-mono font-medium">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
