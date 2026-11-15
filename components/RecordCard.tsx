import type { Confidence, HistoryEntry, RecordType, Source, Tier } from "@/lib/types";
import { confidenceBorder, statusTag, statusText, tierBar } from "./encode";
import { Stamp } from "./Stamp";
import { History } from "./History";

// The one card. Sites, needs, roads, shelters and incidents all render through it.
export function RecordCard(props: {
  type: RecordType;
  title: string;
  detail?: string;
  tier: Tier;
  priority?: number;
  confidence: Confidence;
  status: string;
  at: Date | string;
  source?: Source;
  sources?: number;
  actNow?: boolean;
  history?: HistoryEntry[];
  now: number;
  children?: React.ReactNode;
}) {
  return (
    <article
      className={`relative flex overflow-hidden rounded-card bg-card ${confidenceBorder(props.confidence)}`}
    >
      <div className={`w-2 shrink-0 ${tierBar(props.tier, props.actNow)}`} />
      <div className="min-w-0 flex-1 p-3">
        <header className="flex items-baseline gap-2">
          <h3 className="truncate text-lg font-bold">{props.title}</h3>
          {props.priority !== undefined && (
            <span className="ml-auto whitespace-nowrap text-xs text-muted">
              Priority {props.priority}
            </span>
          )}
        </header>
        {props.detail && <p className="mt-1 text-sm">{props.detail}</p>}
        {props.children}
        <footer className="mt-2 flex items-center gap-2">
          <span className={statusTag}>{statusText(props.status)}</span>
          <Stamp type={props.type} at={props.at} source={props.source} sources={props.sources} now={props.now} />
          <span className="ml-auto text-xs capitalize text-muted">{props.confidence}</span>
        </footer>
        {props.history && props.history.length > 0 && <History entries={props.history} now={props.now} />}
      </div>
    </article>
  );
}
