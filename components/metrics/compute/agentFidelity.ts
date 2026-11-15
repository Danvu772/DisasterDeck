// agent_fidelity, after FActScore (EMNLP 2023): the share of an agent reply's atomic facts that the
// board supports. Needs the scenario's ground truth and a fact extractor for replies. Neither exists,
// so this stays unknown rather than guess.
import type { MetricResult } from "../types";
import type { MetricInput } from "../registry";
import { unknown } from "./shared";

const SOURCE = { name: "FActScore, Min et al., EMNLP 2023", url: "https://arxiv.org/abs/2305.14251" };

export function compute({ now }: MetricInput): MetricResult {
  return unknown("agent_fidelity", "Agent replies backed by the board", SOURCE,
    "Needs the scenario's ground truth to check agent replies against.",
    "no ground truth for this scenario", now);
}
