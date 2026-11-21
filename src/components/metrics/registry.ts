// The metrics engine's front door. allMetrics() runs all ten, metric() runs one, TRIGGERS feeds
// router.ts. Pure: no React, no fetch. `now` is scenario time, so pass deskNow(now) on live data.
import type { Board, Event, User, Zone } from "@/lib/types";
import type { MetricId, MetricResult } from "./types";
import { compute as slaT0 } from "./compute/slaT0";
import { compute as freshness } from "./compute/freshness";
import { compute as credibility } from "./compute/credibility";
import { compute as shelters } from "./compute/shelters";
import { compute as logistics } from "./compute/logistics";
import { compute as coverage } from "./compute/coverage";
import { compute as ics209 } from "./compute/ics209";
import { compute as lifelines } from "./compute/lifelines";
import { compute as agentFidelity } from "./compute/agentFidelity";
import { compute as triageOrder } from "./compute/triageOrder";

// The Board fields. Fixture boards have no zones and a shorter health line, so both are optional.
export type MetricBoard = Pick<Board, "sites" | "needs" | "roads" | "shelters" | "incidents" | "tasks"> & {
  zones?: Zone[];
};

export interface MetricInput {
  board: MetricBoard;
  events?: Event[];
  users?: User[];
  now: number; // scenario clock ms
}

const COMPUTE: Record<MetricId, (input: MetricInput) => MetricResult> = {
  sla_t0: slaT0,
  freshness,
  credibility,
  shelters,
  logistics,
  coverage,
  ics209,
  lifelines,
  agent_fidelity: agentFidelity,
  triage_order: triageOrder,
};

export const METRIC_IDS = Object.keys(COMPUTE) as MetricId[];

export function metric(id: MetricId, input: MetricInput): MetricResult {
  return COMPUTE[id](input);
}

export function allMetrics(input: MetricInput): MetricResult[] {
  return METRIC_IDS.map((id) => COMPUTE[id](input));
}

// Plain words people use when they mean this metric. Lowercase. Each one matches at the start of a
// word and may run on ("road" matches "roads", "barınak" matches "barınakta"). Turkish next to English.
export const TRIGGERS: Record<MetricId, string[]> = {
  sla_t0: ["approval", "approve", "response time", "sla", "tier 0", "tier-0", "t0", "onay"],
  freshness: ["fresh", "stale", "how old", "outdated", "out of date", "up to date", "last update", "güncel", "eski", "taze"],
  credibility: ["trust", "reliab", "credib", "believe", "source", "verified", "rumor", "rumour", "fake", "güven", "kaynak", "teyit"],
  shelters: ["shelter", "bed", "full", "capacity", "space for", "room for", "barınak", "kapasite", "yatak", "çadır", "dolu"],
  logistics: ["deliver", "supplies", "supply", "fill rate", "logistic", "needs", "blanket", "food", "fuel", "water",
    "teslim", "malzeme", "ihtiyaç", "battaniye", "erzak"],
  coverage: ["coverage", "cover", "reach", "near", "who can get", "free team", "available team", "units", "yakın", "ulaş"],
  ics209: ["status report", "sitrep", "situation", "overview", "summary", "big picture", "ics", "209", "brief",
    "how are we doing", "durum", "özet", "genel"],
  lifelines: ["road", "route", "closed", "blocked", "traffic", "bridge", "lifeline", "yol", "kapalı", "köprü", "cadde", "trafik"],
  agent_fidelity: ["fidelity", "hallucinat", "made up", "making up", "make things up", "making things up", "fact check", "fact-check", "factscore", "accurate",
    "accuracy", "uydur"],
  triage_order: ["triage", "order", "rank", "priorit", "most urgent first", "sıra", "öncelik"],
};
