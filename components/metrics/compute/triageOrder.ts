// triage_order: Kendall's tau between the desk's order (tier, then priority) and the true severity
// order. Needs the scenario's true severity per record, which nobody has written down yet.
import type { MetricResult } from "../types";
import type { MetricInput } from "../registry";
import { unknown } from "./shared";

const SOURCE = { name: "Kendall's tau rank correlation", url: "https://en.wikipedia.org/wiki/Kendall_rank_correlation_coefficient" };

export function compute({ now }: MetricInput): MetricResult {
  return unknown("triage_order", "Desk order against true severity", SOURCE,
    "Needs the scenario's true severity for each record, Role 4.",
    "no ground truth for this scenario", now);
}
