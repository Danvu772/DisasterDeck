// The board map's legend. Folds away so it does not cover the markers; the full one is on /map.
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { tierBar } from "../encode";
import { TIER_WORD } from "../detail/fields";

export function BoardLegend({ zones }: { zones: boolean }) {
  const dot = "inline-block size-2.5 shrink-0 rounded-full";
  const row = "flex items-center gap-2";
  return (
    <details open className="group absolute bottom-6 left-3 z-[1000] w-48 rounded-xl border bg-card/95 px-3 py-2 text-xs shadow-xs backdrop-blur">
      <summary className="flex cursor-pointer list-none items-center justify-between font-medium [&::-webkit-details-marker]:hidden">
        Legend
        <ChevronDown className="size-3.5 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="mt-2 space-y-1.5 text-muted-foreground">
        {([0, 1, 2] as const).map((t) => (
          <p key={t} className={row}><span className={`${dot} ${tierBar(t)}`} />{TIER_WORD[t]}</p>
        ))}
        <p className={row}><span className={`size-2.5 shrink-0 rotate-45 rounded-[2px] ${tierBar(2)}`} />Field problem</p>
        <p className={row}><span className={`size-2.5 shrink-0 rounded-[3px] ${tierBar(2)}`} />Shelter</p>
        <p className={row}><span className="h-0.5 w-2.5 shrink-0 rounded-full bg-foreground" />Closed road</p>
        {zones && <p className={row}><span className="size-2.5 shrink-0 rounded-[3px] border border-dashed border-muted-foreground" />Silent or cold zone</p>}
        <p className="pt-1">Bigger means more reports.</p>
        <Link href="/map" className="inline-block pt-0.5 font-medium text-foreground underline-offset-4 hover:underline">Full map</Link>
      </div>
    </details>
  );
}
