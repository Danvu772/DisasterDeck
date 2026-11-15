// One renderer per record type. /lab, /map and /coordinator use these, so a card looks the same everywhere.
import type { Incident, Need, Road, Shelter, Site, Task } from "@/lib/types";
import { CALL_WORD, plainStep, plural } from "./detail/fields";
import { INCIDENT_WORD } from "./detail/locate";
import { LOOP_LABELS, loopStep } from "./loopStep";
import { RecordCard } from "./RecordCard";
import { TaskCard } from "./TaskCard";

export type Board = {
  sites: Site[]; needs: Need[]; shelters: Shelter[]; roads: Road[]; incidents: Incident[]; tasks: Task[];
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// The five rescue steps as dots, the current one named.
export function LoopDots({ site, tasks }: { site: Site; tasks?: Task[] }) {
  const n = loopStep(site, tasks);
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
      <span className="flex gap-0.5" aria-hidden>
        {LOOP_LABELS.map((_, i) => (
          <span key={i} className={`h-1.5 w-3 rounded-full ${i < n ? "bg-foreground" : "bg-border"}`} />
        ))}
      </span>
      <span>{cap(LOOP_LABELS[n - 1])}</span>
    </span>
  );
}

export function SiteCards({ items, now, tasks }: { items: Site[]; now: number; tasks?: Task[] }) {
  return items.map((s) => (
    <RecordCard key={s._id} type="site" title={s.address}
      detail={`${s.peopleTrapped > 0 ? `${plural(s.peopleTrapped, "person", "people")} trapped` : "Nobody reported trapped"} · ${CALL_WORD[s.callStatus] ?? cap(s.callStatus)}`}
      tier={s.tier} priority={s.priority} scoreParts={s.scoreParts} caseNo={s.caseNo} confidence={s.confidence} status={s.status}
      at={s.observedAt} source={s.sources[0]?.source} sources={s.support}
      history={s.history} now={now}>
      <div className="mt-2"><LoopDots site={s} tasks={tasks} /></div>
      {s.hazard && <p className="mt-2 text-xs font-medium text-destructive">Hazard: {s.hazard}</p>}
      {(s.posts ?? []).slice(-2).map((p) => (
        <blockquote key={p.eventId} className="mt-2 border-l-2 pl-3 text-xs text-muted-foreground">{p.textEn}</blockquote>
      ))}
    </RecordCard>
  ));
}

export function NeedCards({ items, now }: { items: Need[]; now: number }) {
  return items.map((n) => (
    <RecordCard key={n._id} type="need" title={`${n.quantity} ${n.item}`}
      detail={n.status === "proposed" ? `${n.support} of 3 requests so far` : undefined}
      tier={n.tier} priority={n.priority} scoreParts={n.scoreParts} caseNo={n.caseNo} confidence={n.confidence} status={n.status}
      at={n.history[0]?.ts ?? new Date(now)} sources={n.support} now={now} />
  ));
}

export function ShelterCards({ items, now }: { items: Shelter[]; now: number }) {
  return items.map((s) => {
    const pct = Math.min(100, Math.round((100 * s.bedsUsed) / Math.max(1, s.bedsTotal)));
    return (
      <RecordCard key={s._id} type="shelter" title={s.name}
        tier={pct > 90 ? 1 : 2} confidence="confirmed"
        status={`${s.bedsUsed} of ${s.bedsTotal} beds`} at={s.observedAt} source={s.source ?? "instagram"} now={now}>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div className={`h-full rounded-full ${pct > 90 ? "bg-warning" : "bg-foreground/70"}`} style={{ width: `${pct}%` }} />
        </div>
      </RecordCard>
    );
  });
}

export function RoadCards({ items, now }: { items: Road[]; now: number }) {
  return items.map((r) => (
    <RecordCard key={r._id} type="road" title={r.road} detail={r.reason} tier={1}
      confidence={r.confidence} status={r.state} at={r.observedAt} source={r.source ?? "person"} now={now} />
  ));
}

export function IncidentCards({ items, now, nameOf }: { items: Incident[]; now: number; nameOf?: (id: string) => string }) {
  return items.map((i) => (
    <RecordCard key={i._id} type="incident" title={INCIDENT_WORD[i.kind] ?? i.kind.replaceAll("_", " ")} detail={i.textEn}
      tier={0} actNow={i.severity === "critical"} caseNo={i.caseNo} confidence="confirmed" status={i.status}
      at={i.actions[0]?.ts ?? new Date(now)} source="person" now={now}>
      {i.actions.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
          {i.actions.map((a, k) => <li key={k} className="flex gap-2"><span aria-hidden>→</span>{plainStep(a.what, nameOf)}</li>)}
        </ul>
      )}
    </RecordCard>
  ));
}

export function TaskCards({ items, now }: { items: Task[]; now: number }) {
  return items.map((t) => <TaskCard key={t._id} task={t} now={now} />);
}
