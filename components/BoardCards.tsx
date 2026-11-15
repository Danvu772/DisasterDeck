// One renderer per record type. /lab and /board both use these, so a card looks the same everywhere.
import type { Incident, Need, Road, Shelter, Site, Task } from "@/lib/types";
import { RecordCard } from "./RecordCard";
import { TaskCard } from "./TaskCard";
import { loopLine } from "./loopStep";

export type Board = {
  sites: Site[]; needs: Need[]; shelters: Shelter[]; roads: Road[]; incidents: Incident[]; tasks: Task[];
};

export function SiteCards({ items, now, tasks }: { items: Site[]; now: number; tasks?: Task[] }) {
  return items.map((s) => {
    const posts = s.sources.length;
    const unseen = !s.history.some((h) => h.source === "person");
    return (
      <RecordCard key={s._id} type="site" title={s.address}
        detail={`${s.peopleTrapped} ${s.peopleTrapped === 1 ? "person" : "people"} trapped. Call status: ${s.callStatus.replace("_", " ")}.`}
        tier={s.tier} priority={s.priority} confidence={s.confidence} status={s.status}
        at={s.observedAt} source={s.sources[0]?.source} sources={s.sources.length}
        history={s.history} now={now}>
        <p className="mt-1 text-xs text-muted">{loopLine(s, tasks)}</p>
        {!(posts === 1 && s.support === 1) && (
          <p className="mt-1 text-xs text-muted">
            {posts} {posts === 1 ? "post" : "posts"} from {s.support} {s.support === 1 ? "person" : "people"}
          </p>
        )}
        {unseen && <p className="mt-1 text-xs text-muted">Automated, not yet seen by a person.</p>}
      </RecordCard>
    );
  });
}

export function NeedCards({ items, now }: { items: Need[]; now: number }) {
  return items.map((n) => (
    <RecordCard key={n._id} type="need" title={`${n.quantity} ${n.item}`} detail={n.region}
      tier={n.tier} priority={n.priority} confidence={n.confidence} status={n.status}
      at={n.history[0]?.ts ?? new Date(now)} now={now}>
      {n.status === "proposed" && (
        <p className="mt-1 text-xs text-muted">
          {n.support} of 3 requests needed
        </p>
      )}
    </RecordCard>
  ));
}

export function ShelterCards({ items, now }: { items: Shelter[]; now: number }) {
  return items.map((s) => (
    <RecordCard key={s._id} type="shelter" title={s.name}
      tier={s.bedsUsed / s.bedsTotal > 0.9 ? 1 : 2} confidence="confirmed"
      status={`${s.bedsUsed}/${s.bedsTotal}`} at={s.observedAt} source="instagram" now={now}>
      <div className="mt-2 h-1.5 w-full rounded bg-line">
        <div className="h-1.5 rounded bg-ink" style={{ width: `${(100 * s.bedsUsed) / s.bedsTotal}%` }} />
      </div>
    </RecordCard>
  ));
}

export function RoadCards({ items, now }: { items: Road[]; now: number }) {
  return items.map((r) => (
    <RecordCard key={r._id} type="road" title={r.road} detail={r.reason} tier={1}
      confidence={r.confidence} status={r.state} at={r.observedAt} source="person" now={now} />
  ));
}

export function IncidentCards({ items, now }: { items: Incident[]; now: number }) {
  return items.map((i) => (
    <RecordCard key={i._id} type="incident" title={i.kind.replace("_", " ")} detail={i.textEn}
      tier={0} actNow={i.severity === "critical"} confidence="confirmed" status={i.status}
      at={i.actions[0]?.ts ?? new Date(now)} source="person" now={now}>
      <p className="mt-1 text-xs text-muted">{i.text}</p>
      <p className="mt-2 text-xs font-bold">Actions taken</p>
      <ul className="mt-0.5 space-y-0.5 text-xs">
        {i.actions.map((a, k) => <li key={k}>{a.what}</li>)}
      </ul>
    </RecordCard>
  ));
}

export function TaskCards({ items, now }: { items: Task[]; now: number }) {
  return items.map((t) => <TaskCard key={t._id} task={t} now={now} />);
}
