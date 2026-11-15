// The contract between the metrics engine (t32), the charts (t33) and the chat (t34).
// One MetricResult per metric. The engine computes it from the board, the charts draw it,
// the chat shows it under a reply. Every metric names its source, and says "unknown" with a
// reason instead of inventing a number. Owner: Role 3. Research: docs/frontend/METRICS.md.

export type MetricId =
  | "sla_t0"          // NFPA 1710: percentile time to approve tier-0 work
  | "freshness"       // WIISARD: quality decays with the age of the fact
  | "credibility"     // Admiralty code: source reliability x information credibility, two axes
  | "shelters"        // FEMA ESF#6 Shelter System fields
  | "logistics"       // Beamon & Balcik 2008: fill rate and delivery time
  | "coverage"        // Church & ReVelle 1974, MCLP: open sites with a free unit within reach
  | "ics209"          // FEMA ICS-209: incident status snapshot
  | "lifelines"       // FEMA Community Lifelines, Transportation: road status with evidence
  | "agent_fidelity"  // FActScore (EMNLP 2023): share of an agent's atomic facts the desk supports
  | "triage_order";   // Kendall's tau between the desk's order and the true severity order

export type MetricStatus = "ok" | "warn" | "act" | "unknown";
// Tone maps to tokens through encode.ts: act = act red, warn = urgent gold, calm = calm grey,
// ok = the ok green, primary = the selected or highlighted series. Never a raw colour.
export type Tone = "act" | "warn" | "calm" | "ok" | "primary" | "ink";

export interface MetricPoint {
  label: string;      // "Shelter A", "T0", "X posts"
  value: number;
  max?: number;       // for gauges and used/total bars
  tone?: Tone;
  note?: string;      // "58 of 60 beds, IG, 2 h ago"
  recordKey?: string; // "site:site-57": the chat can link it to /?open= and the map
}

export type ChartSpec =
  | { kind: "bars"; unit?: string; points: MetricPoint[] }                 // horizontal bars, one per point
  | { kind: "gauge"; unit?: string; point: MetricPoint }                   // one value against max
  | { kind: "matrix"; rows: string[]; cols: string[]; cells: number[][];  // Admiralty 6 x 6 counts
      rowTitle: string; colTitle: string }
  | { kind: "snapshot"; rows: { label: string; value: string; tone?: Tone }[] } // ICS-209 style table
  | { kind: "none" };                                                      // unknown metrics

export interface MetricSource { name: string; url: string; }

export interface MetricResult {
  id: MetricId;
  title: string;        // "Tier-0 approvals, 90th percentile"
  headline: string;     // one plain sentence with the number: "90% of tier-0 approvals took 4 min or less."
  status: MetricStatus;
  chart: ChartSpec;
  basis: string;        // what it was computed from: "7 approvals in the last 2 h of scenario time"
  source: MetricSource; // the standard or paper the metric comes from
  unknownReason?: string; // set when status is "unknown": what data is missing and who owns it
  computedAt: number;   // scenario clock ms (components/clock.ts)
}
