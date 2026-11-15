// One renderer per record type. /lab and /board both use these, so a card looks the same everywhere.
import type { Incident, Need, Road, Shelter, Site, Task } from "@/lib/types";
import { RecordCard } from "./RecordCard";
import { TaskCard } from "./TaskCard";

export type Board = {
  sites: Site[]; needs: Need[]; shelters: Shelter[]; roads: Road[]; incidents: Incident[]; tasks: Task[];
};

export function SiteCards({ items, now }: { items: Site[]; now: number }) {
  return items.map((s) => (
    <RecordCard key={s._id} type="site" title={s.address}
      detail={`${s.peopleTrapped} ${s.peopleTrapped === 1 ? "person" : "people"} · call: ${s.callStatus.replace("_", " ")}`}
      tier={s.tier} priority={s.priority} confidence={s.confidence} status={s.status}
      at={s.observedAt} source={s.sources[0]?.source} sources={s.sources.length}
      history={s.history} now={now} />
  ));
}

export function NeedCards({ items, now }: { items: Need[]; now: number }) {
  return items.map((n) => (
    <RecordCard key={n._id} type="need" title={`${n.quantity} ${n.item}`} detail={n.region}
      tier={n.tier} priority={n.priority} confidence={n.confidence} status={n.status}
      at={n.history[0]?.ts ?? new Date(now)} now={now}>
      {n.status === "proposed" && (
        <p className="mt-1 font-mono text-xs text-muted">
          {"●".repeat(n.support)}{"○".repeat(Math.max(0, 3 - n.support))} {n.support} of 3 asked
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
      <p className="mt-1 text-xs italic text-muted">{i.text}</p>
      <ul className="mt-2 space-y-0.5 font-mono text-xs">
        {i.actions.map((a, k) => <li key={k}>→ {a.what}</li>)}
      </ul>
    </RecordCard>
  ));
}

export function TaskCards({ items, now }: { items: Task[]; now: number }) {
  return items.map((t) => <TaskCard key={t._id} task={t} now={now} />);
}
