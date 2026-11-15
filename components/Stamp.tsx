import type { RecordType, Source } from "@/lib/types";
import { ageText, isStale } from "./encode";

export const SOURCE_LABEL: Record<Source, string> = {
  x: "X", news: "News", reddit: "Reddit", instagram: "Instagram", facebook: "Facebook",
  sheet: "Sheet", nasa: "NASA", person: "Field report", system: "Desk",
};

// "Instagram · 4 min ago", or "3 reports · 4 min ago". Fades and says "Stale" past the per-type threshold.
export function Stamp(props: {
  source?: Source; sources?: number; at: Date | string; type: RecordType; now: number;
}) {
  const stale = isStale(props.type, props.at, props.now);
  const what = props.sources && props.sources > 1
    ? `${props.sources} reports`
    : props.source && props.source !== "system" ? SOURCE_LABEL[props.source] : null;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
      {what && <><span>{what}</span><span aria-hidden>·</span></>}
      <span className={stale ? "opacity-60" : ""} suppressHydrationWarning>{ageText(props.at, props.now)}</span>
      {stale && <span className="rounded-full border px-1.5 text-[10px] leading-4">Stale</span>}
    </span>
  );
}
