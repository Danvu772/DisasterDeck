// Pure adapter: a board in, the three coordinator lists out. No fetching, no React.
import type { Board, Confidence, Incident, Source, Task, Zone } from "@/lib/types";

// Zones are optional so the fixture board (which has none) fits too.
export type CoordinatorSource = Pick<Board, "sites" | "needs" | "roads" | "shelters" | "incidents" | "tasks"> & { zones?: Zone[] };

// What the coordinator needs to know about the record a task points to.
export type About = {
  name: string;
  confidence: Confidence;
  at: Date | string;
  source?: Source;
  sources?: number;
  found: boolean;
};

export type CoordinatorItem = { task: Task; about: About };

const SEVERITY_ORDER = { critical: 0, high: 1, low: 2 } as const;

export function aboutRecord(b: CoordinatorSource, t: Task): About {
  const fallback = t.history[0]?.ts ?? t.deadline;
  switch (t.recordType) {
    case "site": {
      const s = b.sites.find((r) => r._id === t.recordId);
      if (s) return { name: s.address, confidence: s.confidence, at: s.observedAt,
        source: s.sources[0]?.source, sources: s.sources.length, found: true };
      break;
    }
    case "need": {
      const n = b.needs.find((r) => r._id === t.recordId);
      if (n) return { name: `${n.quantity} ${n.item}`, confidence: n.confidence,
        at: n.history[0]?.ts ?? fallback, source: n.history[0]?.source, found: true };
      break;
    }
    case "road": {
      const r = b.roads.find((x) => x._id === t.recordId);
      if (r) return { name: r.road, confidence: r.confidence, at: r.observedAt,
        source: r.history[0]?.source, found: true };
      break;
    }
    case "shelter": {
      const s = b.shelters.find((r) => r._id === t.recordId);
      if (s) return { name: s.name, confidence: "confirmed", at: s.observedAt, found: true };
      break;
    }
    case "incident": {
      const i = b.incidents.find((r) => r._id === t.recordId);
      if (i) return { name: i.textEn, confidence: "confirmed", at: i.actions[0]?.ts ?? fallback,
        source: "person", found: true };
      break;
    }
    case "zone": {
      const z = (b.zones ?? []).find((r) => r._id === t.recordId);
      if (z) return { name: z.name, confidence: "confirmed", at: fallback, source: "nasa", found: true };
      break;
    }
  }
  return { name: t.recordId, confidence: "unconfirmed", at: fallback, found: false };
}

// Low-risk work the dispatcher gave to someone without asking: open, has an owner, newest first.
export function handedOut(b: CoordinatorSource, limit = 5) {
  return (b.tasks ?? [])
    .filter((t) => t.open && t.assignee && t.risk === "low")
    .map((task) => ({ task, at: task.history.at(-1)?.ts ?? task.deadline }))
    .sort((x, y) => +new Date(y.at) - +new Date(x.at))
    .slice(0, limit);
}

export function fromBoard(b: CoordinatorSource) {
  const tasks = b.tasks ?? [];
  const approvals = tasks
    .filter((t) => t.status === "waiting_approval")
    .sort((x, y) => +new Date(x.deadline) - +new Date(y.deadline))
    .map((task) => ({ task, about: aboutRecord(b, task) }));
  const escalated = tasks
    .filter((t) => t.status === "escalated")
    .sort((x, y) => x.tier - y.tier || y.priority - x.priority)
    .map((task) => ({ task, about: aboutRecord(b, task) }));
  const problems: Incident[] = (b.incidents ?? [])
    .filter((i) => i.status !== "resolved")
    .sort((x, y) => SEVERITY_ORDER[x.severity] - SEVERITY_ORDER[y.severity]);
  return { approvals, escalated, problems };
}
