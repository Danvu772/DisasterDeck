import type { Confidence, HistoryEntry, RecordType, ScorePart, Source, Tier } from "@/lib/types";
import { confidenceBorder, statusTag, statusText, tierBar, tierText } from "./encode";
import { CaseNo, ScoreBreakdown } from "./ScoreBreakdown";
import { Stamp } from "./Stamp";
import { History } from "./History";

// The one card. Sites, needs, roads, shelters and incidents all render through it.
export function RecordCard(props: {
  type: RecordType;
  title: string;
  detail?: string;
  tier: Tier;
  priority?: number;
  scoreParts?: ScorePart[];
  caseNo?: number;
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
          {props.caseNo !== undefined && (
            <span className="whitespace-nowrap text-sm text-muted"><CaseNo kind={props.type} no={props.caseNo} /></span>
          )}
          <h3 className="truncate text-lg font-bold">{props.title}</h3>
          <span className="ml-auto flex items-baseline gap-2 whitespace-nowrap text-xs text-muted">
            <span><span className="font-mono">{tierText(props.tier).code}</span> {tierText(props.tier).word}</span>
            {props.priority !== undefined && <ScoreBreakdown priority={props.priority} parts={props.scoreParts} />}
          </span>
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
