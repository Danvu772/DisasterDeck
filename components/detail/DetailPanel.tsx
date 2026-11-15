"use client";
// One record, in human words: what it is, how bad, where, the numbers that matter, when, how many
// people said so, and what happened since. The board's right column at md and up, a full-screen
// sheet on a phone. Reads only the board the page already polls; ids and raw fields never show.
import { ChevronRight, Clock, Flame, Map as MapIcon, MapPin, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import type { Incident, Need, Road, Shelter, Site, Task } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { type Board, LoopDots } from "../BoardCards";
import { History } from "../History";
import { KindIcon, TierBadge } from "../RecordCard";
import { SOURCE_LABEL } from "../Stamp";
import { ageText } from "../encode";
import { CaseNo, ScoreBreakdown } from "../ScoreBreakdown";
import { actorLabel, CALL_WORD, KIND_WORD, statusWord, trustWord, when } from "./fields";
import { type AnyRecord, type DetailKind, findRecord, links, locate, parseKey, summary } from "./locate";

export { KIND_WORD };

type Stat = { label: string; value: React.ReactNode; sub?: string };
type Fact = { label: string; value: React.ReactNode; tone?: "act" };

function Stats({ items }: { items: Stat[] }) {
  if (items.length === 0) return null;
  return (
    <div className={`grid gap-2 ${items.length > 2 ? "grid-cols-3" : "grid-cols-2"}`}>
      {items.map((s) => (
        <div key={s.label} className="rounded-lg bg-secondary px-3 py-2.5">
          <p className="text-xs text-muted-foreground">{s.label}</p>
          <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight">{s.value}</p>
          {s.sub && <p className="truncate text-xs text-muted-foreground">{s.sub}</p>}
        </div>
      ))}
    </div>
  );
}

function Facts({ items }: { items: Fact[] }) {
  if (items.length === 0) return null;
  return (
    <dl className="divide-y rounded-lg border text-sm">
      {items.map((f) => (
        <div key={f.label} className="flex items-baseline justify-between gap-4 px-3 py-2">
          <dt className="shrink-0 text-muted-foreground">{f.label}</dt>
          <dd className={`min-w-0 text-right font-medium ${f.tone === "act" ? "text-destructive" : ""}`}>{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section>
    <h3 className="mb-2 text-sm font-semibold">{title}</h3>
    {children}
  </section>
);

const nameList = (ids: string[]) => ids.map(actorLabel).join(", ");

// When the record was true.
function seenAt(kind: DetailKind, r: AnyRecord): Date | string | undefined {
  switch (kind) {
    case "site": return (r as Site).observedAt;
    case "shelter": return (r as Shelter).observedAt;
    case "road": return (r as Road).observedAt;
    case "need": return (r as Need).history[0]?.ts;
    case "incident": { const i = r as Incident; return i.actions[0]?.ts ?? i.history[0]?.ts; }
    case "task": return (r as Task).history[0]?.ts;
  }
}

// The big numbers and the plain facts for one record. Only what a person acts on.
function body(kind: DetailKind, r: AnyRecord, board: Board, now: number): { stats: Stat[]; facts: Fact[] } {
  switch (kind) {
    case "site": {
      const s = r as Site;
      return {
        stats: [
          { label: "People trapped", value: s.peopleTrapped },
          { label: "Reported by", value: s.support, sub: s.support === 1 ? "person" : "different people" },
        ],
        facts: [{ label: "Call", value: CALL_WORD[s.callStatus] ?? statusWord(s.callStatus) }],
      };
    }
    case "need": {
      const n = r as Need;
      const sites = n.siteIds.map((id) => board.sites.find((x) => x._id === id)?.address).filter(Boolean) as string[];
      return {
        stats: [
          { label: "Quantity", value: n.quantity, sub: n.item },
          { label: "Asked by", value: n.support, sub: n.support === 1 ? "person" : "different people" },
        ],
        facts: [
          ...(sites.length ? [{ label: "For", value: sites.join(", ") }] : []),
          ...(n.lifeThreatening ? [{ label: "Danger to life", value: "Yes", tone: "act" as const }] : []),
          ...(n.requestedBy.length ? [{ label: "Requested by", value: nameList(n.requestedBy) }] : []),
        ],
      };
    }
    case "shelter": {
      const h = r as Shelter;
      return {
        stats: [
          { label: "Beds used", value: <>{h.bedsUsed}<span className="text-base text-muted-foreground">/{h.bedsTotal}</span></> },
          { label: "Free beds", value: Math.max(0, h.bedsTotal - h.bedsUsed) },
        ],
        facts: h.source ? [{ label: "Number from", value: SOURCE_LABEL[h.source] }] : [],
      };
    }
    case "road": {
      const d = r as Road;
      return { stats: [], facts: [{ label: "Road is", value: statusWord(d.state) }, { label: "Why", value: d.reason }] };
    }
    case "incident": {
      const i = r as Incident;
      return {
        stats: [],
        facts: [
          { label: "Reported by", value: i.reportedBy === "sweeper" ? "The desk" : actorLabel(i.reportedBy) },
          { label: "Can still finish", value: i.canContinue ? "Yes" : "No", tone: i.canContinue ? undefined : "act" },
        ],
      };
    }
    case "task": {
      const t = r as Task;
      const overdue = t.open && new Date(t.deadline).getTime() < now;
      return {
        stats: [],
        facts: [
          { label: "Owner", value: t.assignee ? actorLabel(t.assignee) : "Nobody yet" },
          { label: "Answer by", value: overdue ? "Overdue" : when(t.deadline, now), tone: overdue ? "act" : undefined },
          ...(t.eta ? [{ label: "Promised finish", value: when(t.eta, now) }] : []),
          ...(t.risk === "high" ? [{ label: "Risk", value: "High", tone: "act" as const }] : []),
        ],
      };
    }
  }
}

export function DetailPanel({ board, now, live, openKey, onOpen, onClose }: {
  board: Board; now: number; live: boolean; openKey: string;
  onOpen: (key: string) => void;
  onClose: () => void;     // the phone sheet's Close. The column at md and up has no close, it always shows a record
}) {
  const ref = parseKey(openKey);
  const record = ref ? findRecord(board, ref.kind, ref.id) : undefined;

  const shell = (content: React.ReactNode) => (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* The phone sheet covers the list, so it carries its own close. */}
      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2 md:hidden">
        <p className="text-sm font-medium">{ref ? KIND_WORD[ref.kind] : "Record"}</p>
        {!live && <span className="rounded-full border px-2 text-xs text-muted-foreground">Demo data</span>}
        <Button variant="ghost" size="sm" onClick={onClose} className="ml-auto"><X aria-hidden />Close</Button>
      </div>
      {content}
    </div>
  );

  if (!ref || !record) {
    return shell(
      <div className="grid flex-1 place-items-center p-8 text-center">
        <div>
          <p className="text-sm font-medium">No longer on the board</p>
          <p className="mt-1 text-xs text-muted-foreground">It may have been merged or retracted.</p>
        </div>
      </div>,
    );
  }

  const { kind } = ref;
  const head = summary(kind, record, now);
  const loc = locate(kind, record, board);
  const { stats, facts } = body(kind, record, board, now);
  const related = links(kind, record, board).filter((l) => l.record);
  const site = kind === "site" ? (record as Site) : undefined;
  const incident = kind === "incident" ? (record as Incident) : undefined;
  const shelter = kind === "shelter" ? (record as Shelter) : undefined;
  const history = (record as { history?: Site["history"] }).history ?? [];
  const seen = seenAt(kind, record);
  const support = (record as { support?: number }).support;
  const trust = trustWord(head.confidence, support);
  const pct = shelter ? Math.min(100, Math.round((100 * shelter.bedsUsed) / Math.max(1, shelter.bedsTotal))) : 0;

  return shell(
    <div className="min-h-0 flex-1 overflow-y-auto">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={openKey} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 36 }} className="flex flex-col gap-5 p-5">

          <header>
            <div className="flex items-center gap-2.5">
              <KindIcon type={kind} record={record} tier={head.tier} actNow={head.actNow} className="size-9" />
              <span className="text-xs text-muted-foreground">{KIND_WORD[kind]}</span>
              <TierBadge tier={head.tier} actNow={head.actNow} className="ml-auto" />
            </div>
            <h2 className="mt-3 text-lg font-semibold leading-snug tracking-tight">
              {head.caseNo !== undefined && <span className="mr-2 text-sm font-normal text-muted-foreground"><CaseNo kind={kind} no={head.caseNo} /></span>}
              <span className="first-letter:uppercase">{head.title}</span>
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {loc?.via && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden />{loc.via.label}</span>}
              {seen && <span className="inline-flex items-center gap-1" suppressHydrationWarning><Clock className="size-3.5" aria-hidden />{ageText(seen, now)}</span>}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {kind !== "shelter" && <span className="inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-medium">{statusWord(head.status)}</span>}
              <span className="text-xs text-muted-foreground">{trust}</span>
              {head.priority !== undefined && <ScoreBreakdown priority={head.priority} parts={head.scoreParts} className="ml-auto" />}
            </div>
          </header>

          {site?.hazard && (
            <div className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              <Flame className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p><span className="font-medium">Hazard:</span> {site.hazard}</p>
            </div>
          )}

          <Stats items={stats} />

          {shelter && (
            <div className="h-2 overflow-hidden rounded-full bg-secondary" role="img" aria-label={`${pct}% full`}>
              <div className={`h-full rounded-full ${pct > 90 ? "bg-warning" : "bg-foreground/70"}`} style={{ width: `${pct}%` }} />
            </div>
          )}

          {site && <LoopDots site={site} tasks={board.tasks} />}

          {incident && (
            <blockquote className="rounded-lg bg-secondary px-3 py-2.5 text-sm">
              <p>{incident.textEn}</p>
              {incident.text !== incident.textEn && <p className="mt-1 text-xs text-muted-foreground">{incident.text}</p>}
            </blockquote>
          )}
          {kind === "task" && (record as Task).detail && <p className="text-sm text-foreground/90">{(record as Task).detail}</p>}

          <Facts items={facts} />

          {site?.posts && site.posts.length > 0 && (
            <Section title="What people said">
              <ul className="space-y-2.5">
                {site.posts.slice(-3).reverse().map((p) => (
                  <li key={p.eventId} className="border-l-2 pl-3 text-sm">
                    <p>{p.textEn}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground" suppressHydrationWarning>{SOURCE_LABEL[p.source]} · {ageText(p.observedAt, now)}</p>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {incident && incident.actions.length > 0 && (
            <Section title="What the desk did">
              <ol className="space-y-2 border-l pl-3.5 text-sm">
                {incident.actions.map((a, i) => (
                  <li key={i} className="relative">
                    <span aria-hidden className="absolute -left-[18px] top-1.5 size-1.5 rounded-full bg-foreground/60 ring-2 ring-card" />
                    <p>{a.what}</p>
                    <p className="text-xs text-muted-foreground" suppressHydrationWarning>{when(a.ts, now)}</p>
                  </li>
                ))}
              </ol>
            </Section>
          )}

          {related.length > 0 && (
            <Section title="Related">
              <ul className="space-y-1">
                {related.map((l) => {
                  const s = summary(l.kind, l.record!, now);
                  return (
                    <li key={`${l.why}:${l.key}`}>
                      <button type="button" onClick={() => onOpen(l.key)}
                        className="group flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors hover:bg-secondary/60">
                        <KindIcon type={l.kind} record={l.record} tier={s.tier} actNow={s.actNow} className="size-7" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium first-letter:uppercase">{s.title}</span>
                          <span className="block text-xs text-muted-foreground">{KIND_WORD[l.kind]} · {statusWord(s.status)}</span>
                        </span>
                        <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}

          {(loc || history.length > 0) && (
            <footer className="flex flex-col items-start gap-1 border-t pt-4">
              {loc && (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/map?focus=${encodeURIComponent(loc.key)}`}><MapIcon aria-hidden />Open on the full map</Link>
                </Button>
              )}
              {history.length > 0 && <History entries={history} now={now} />}
            </footer>
          )}
          {!loc && <p className="text-xs text-muted-foreground">No location yet.</p>}
        </motion.div>
      </AnimatePresence>
    </div>,
  );
}
