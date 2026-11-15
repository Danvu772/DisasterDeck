// sla_t0, NFPA 1710 style: how long tier-0 high-risk work waits for a coordinator's approval.
// Percentiles and the share within the target, never the average (one slow approval hides in a mean).
// Start: the history entry that asked for approval, else the task's first history entry
// (a high-risk tier-0 task is created straight into waiting_approval). End: the approval entry
// in history, or an approval event for the task. Tasks still waiting are listed with their wait so far.
import type { ApprovalPayload, Task } from "@/lib/types";
import type { MetricPoint, MetricResult } from "../types";
import type { MetricInput } from "../registry";
import { agoText, minText, minutesAgo, ms, oldest, pct, percentile, plural, unknown } from "./shared";

const SOURCE = { name: "NFPA 1710 percentile benchmarks, DC FEMS", url: "https://fems.dc.gov/page/evaluating-response-times" };
const TITLE = "Tier-0 approvals, 90th percentile";
const TARGET_MIN = 5;

const ASKED = /approval/i;     // "Needs coordinator approval", "Asked for approval"
const APPROVED = /\bapproved\b/i;

function approvalSpan(t: Task, approvals: Map<string, number>): { start: number; end: number } | null {
  const h = (t.history ?? []).map((e) => ({ t: ms(e.ts), reason: e.reason ?? "" })).filter((e) => !Number.isNaN(e.t));
  const approvedAt = oldest(h.filter((e) => APPROVED.test(e.reason)).map((e) => e.t).concat(approvals.get(t._id) ?? []));
  const asked = h.filter((e) => ASKED.test(e.reason) && !APPROVED.test(e.reason) && !(e.t > approvedAt));
  const before = h.filter((e) => !APPROVED.test(e.reason) && !(e.t > approvedAt));
  const start = oldest((asked.length ? asked : before).map((e) => e.t));
  if (Number.isNaN(start)) return null;
  return { start, end: approvedAt };
}

export function compute({ board, events, now }: MetricInput): MetricResult {
  const approvals = new Map<string, number>();
  for (const e of events ?? []) {
    if (e.type !== "approval") continue;
    const id = (e.payload as ApprovalPayload)?.taskId;
    const at = ms(e.ts);
    if (id && !Number.isNaN(at)) approvals.set(id, Math.min(approvals.get(id) ?? at, at));
  }

  const t0 = board.tasks.filter((t) => t.tier === 0 && t.risk === "high");
  const done: number[] = [];
  const waiting: { task: Task; min: number }[] = [];
  let unmeasured = 0;
  for (const t of t0) {
    const span = approvalSpan(t, approvals);
    if (span && !Number.isNaN(span.end)) done.push(Math.max(0, (span.end - span.start) / 60000));
    else if (span && t.status === "waiting_approval") waiting.push({ task: t, min: minutesAgo(span.start, now) });
    else if (t.status === "waiting_approval" || approvals.has(t._id)) unmeasured++;
  }
  waiting.sort((a, b) => b.min - a.min);

  if (!done.length && !waiting.length) {
    return unknown("sla_t0", TITLE, SOURCE,
      "No tier-0 high-risk task has a timed approval yet. Needs the Brain's dispatcher to create them with history, Role 1, issue #8.",
      `${plural(t0.length, "tier-0 high-risk task")} on the board${unmeasured ? `, ${unmeasured} without a start time` : ""}`, now);
  }

  const p50 = percentile(done, 0.5);
  const p90 = percentile(done, 0.9);
  const within = done.filter((m) => m <= TARGET_MIN).length;
  const late = waiting.filter((w) => w.min > TARGET_MIN);

  const points: MetricPoint[] = [];
  if (done.length) {
    points.push(
      { label: "Median, min", value: Math.round(p50), tone: p50 > TARGET_MIN ? "warn" : "ok" },
      { label: "90th percentile, min", value: Math.round(p90), tone: p90 > TARGET_MIN ? "warn" : "ok", note: `target ${TARGET_MIN} min` },
      { label: `Within ${TARGET_MIN} min, percent`, value: pct(within, done.length), max: 100,
        tone: within === done.length ? "ok" : "warn", note: `${within} of ${done.length} approvals` },
    );
  }
  for (const w of waiting.slice(0, 3)) {
    points.push({
      label: `Waiting now, ${w.task.title}`, value: Math.round(w.min),
      tone: w.min > TARGET_MIN ? "act" : "calm", note: `waiting ${minText(w.min)}, no approval yet`,
      recordKey: `task:${w.task._id}`,
    });
  }

  const parts: string[] = [];
  if (done.length) {
    parts.push(`90% of tier-0 approvals took ${minText(p90)} or less, and ${within} of ${done.length} came within ${TARGET_MIN} min.`);
  }
  if (waiting.length) {
    parts.push(`${plural(waiting.length, "task")} ${waiting.length === 1 ? "is" : "are"} waiting now, the longest for ${minText(waiting[0].min)}.`);
  }
  const newestApproval = done.length ? Math.max(...t0.map((t) => approvalSpan(t, approvals)?.end ?? NaN).filter((x) => !Number.isNaN(x))) : NaN;

  return {
    id: "sla_t0", title: TITLE, source: SOURCE, computedAt: now,
    status: late.length ? "act" : done.length && p90 > TARGET_MIN ? "warn" : "ok",
    headline: parts.join(" "),
    chart: { kind: "bars", points },
    basis: [
      `${plural(done.length, "approval")} timed`,
      waiting.length ? `${waiting.length} still waiting` : "",
      Number.isNaN(newestApproval) ? "" : `newest approval ${agoText(newestApproval, now)}`,
      unmeasured ? `${unmeasured} without a start time left out` : "",
    ].filter(Boolean).join(", "),
  };
}
