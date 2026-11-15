import type { RecordType, Source } from "@/lib/types";
import { ageText, isStale, staleInk } from "./encode";

export const SOURCE_LABEL: Record<Source, string> = {
  x: "X", news: "news", reddit: "Reddit", instagram: "IG", facebook: "FB",
  sheet: "sheet", nasa: "NASA", person: "person", system: "desk",
};

// "IG, 4 min ago". Fades and says "stale" past the per-type threshold.
export function Stamp(props: {
  source?: Source; sources?: number; at: Date | string; type: RecordType; now: number;
}) {
  const stale = isStale(props.type, props.at, props.now);
  const what = props.sources && props.sources > 1
    ? `${props.sources} sources`
    : props.source ? SOURCE_LABEL[props.source] : null;
  return (
    <span className={`text-xs text-muted ${staleInk(stale)}`}>
      {what && <>{what}, </>}
      {ageText(props.at, props.now)}
      {stale && <> (stale)</>}
    </span>
  );
}
