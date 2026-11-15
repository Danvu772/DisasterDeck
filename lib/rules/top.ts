// The delegator's view of a person's open work, decided from the knowledge base as it is now.
// A task keeps the tier and priority it was made with. The record it points at changes (new reports,
// a rescore, a closed site), so the ranking reads the record, not the copy.
// Order: overdue first, then tier (T0 first), then the record's current priority, then the earlier deadline.
// A task whose record is closed, delivered or retracted is left out: it no longer needs anyone.
import type { Need, Site, Task } from "../types";

export interface Ranked {
  task: Task;
  tier: number;
  priority: number;
  overdue: boolean;
  why: string;
}

export interface KnowledgeBase {
  sites: Pick<Site, "_id" | "tier" | "priority" | "status">[];
  needs: Pick<Need, "_id" | "tier" | "priority" | "status">[];
}

const DONE_SITE = new Set(["closed", "retracted"]);
const DONE_NEED = new Set(["delivered"]);

export function rankOpen(tasks: Task[], kb: KnowledgeBase, userId: string, now: number): Ranked[] {
  const sites = new Map(kb.sites.map((s) => [s._id, s]));
  const needs = new Map(kb.needs.map((n) => [n._id, n]));
  const out: Ranked[] = [];
  for (const task of tasks) {
    if (!task.open || task.assignee !== userId) continue;
    const rec = task.recordType === "site" ? sites.get(task.recordId) : task.recordType === "need" ? needs.get(task.recordId) : undefined;
    // A record we cannot see, or one that is finished, takes the task off the list.
    if (!rec) continue;
    if (task.recordType === "site" && DONE_SITE.has((rec as Site).status)) continue;
    if (task.recordType === "need" && DONE_NEED.has((rec as Need).status)) continue;
    const overdue = new Date(task.deadline).getTime() < now;
    out.push({
      task,
      tier: rec.tier,
      priority: rec.priority,
      overdue,
      why: [overdue && "overdue", `T${rec.tier}`, `priority ${rec.priority}`].filter(Boolean).join(", "),
    });
  }
  return out.sort((a, b) =>
    Number(b.overdue) - Number(a.overdue)
    || a.tier - b.tier
    || b.priority - a.priority
    || new Date(a.task.deadline).getTime() - new Date(b.task.deadline).getTime());
}
