import type { Confidence, HistoryEntry, RecordType, ScorePart, Source, Tier } from "@/lib/types";
import { cn } from "@/lib/utils";
import { thingIcon } from "./icons/things";
import { KIND_ICON, statusWord, TIER_WORD, trustWord } from "./detail/fields";
import { CaseNo, ScoreBreakdown } from "./ScoreBreakdown";
import { History } from "./History";
import { Stamp } from "./Stamp";

// The tier as a word with a dot. Red only for life-threatening (or act-now), amber for urgent, grey for the rest.
export function TierBadge({ tier, actNow, className }: { tier: Tier; actNow?: boolean; className?: string }) {
  const red = actNow || tier === 0;
  return (
    <span className={cn(
      "inline-flex h-5 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-xs font-medium",
      red ? "bg-destructive/10 text-destructive" : tier === 1 ? "bg-warning/15 text-foreground" : "bg-secondary text-muted-foreground",
      className,
    )}>
      <span aria-hidden className={cn("size-1.5 rounded-full", red ? "bg-destructive" : tier === 1 ? "bg-warning" : "bg-calm")} />
      {TIER_WORD[tier]}
    </span>
  );
}

// A record kind's icon in a soft tile, tinted by how bad it is.
export function KindIcon({ type, tier, actNow, className, record }: {
  type: RecordType | "task"; tier: Tier; actNow?: boolean; className?: string;
  record?: unknown;   // with it, the same icon the record's map marker shows (a fire, a closed road …)
}) {
  const Icon = thingIcon(type, record) ?? KIND_ICON[type];
  const red = actNow || tier === 0;
  return (
    <span aria-hidden className={cn(
      "grid size-8 shrink-0 place-items-center rounded-lg",
      red ? "bg-destructive/10 text-destructive" : tier === 1 ? "bg-warning/15 text-foreground" : "bg-secondary text-muted-foreground",
      className,
    )}>
      <Icon className="size-4" />
    </span>
  );
}

// The one card. Sites, needs, roads, shelters, incidents and tasks all render through it.
// Unconfirmed records get a dashed border; everything else is one quiet line.
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
  const trust = trustWord(props.confidence, props.sources);
  return (
    <article className={cn(
      "rounded-xl border bg-card p-4 text-card-foreground shadow-xs",
      props.confidence === "unconfirmed" && "border-dashed",
    )}>
      <header className="flex items-start gap-3">
        <KindIcon type={props.type} tier={props.tier} actNow={props.actNow} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">
            {props.caseNo !== undefined && <span className="mr-1.5 font-normal text-muted-foreground"><CaseNo kind={props.type} no={props.caseNo} /></span>}
            <span className="first-letter:uppercase">{props.title}</span>
          </h3>
          <Stamp type={props.type} at={props.at} source={props.source} sources={props.sources} now={props.now} />
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <TierBadge tier={props.tier} actNow={props.actNow} />
          {props.priority !== undefined && <ScoreBreakdown priority={props.priority} parts={props.scoreParts} />}
        </div>
      </header>
      {props.detail && <p className="mt-3 text-sm text-foreground/90">{props.detail}</p>}
      {props.children}
      <footer className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex h-5 items-center rounded-full border px-2 text-xs font-medium">{statusWord(props.status)}</span>
        {trust !== "Confirmed" && <span className="text-xs text-muted-foreground">{trust}</span>}
      </footer>
      {props.history && props.history.length > 0 && <History entries={props.history} now={props.now} />}
    </article>
  );
}
