// Check for the delegator's ranking: npm run top:check. Pure, no database.
import assert from "node:assert/strict";
import { rankOpen, type KnowledgeBase } from "./rules/top";
import type { Task } from "./types";

const now = Date.parse("2026-11-15T09:00:00Z");
const later = new Date(now + 60 * 60_000);
const earlier = new Date(now - 60 * 60_000);
const task = (id: string, recordId: string, over: Partial<Task> = {}): Task => ({
  _id: id, type: "call", recordType: "site", recordId, tried: [], risk: "low", tier: 0, priority: 0,
  status: "assigned", open: true, title: id, detail: "", deadline: later, history: [], deskId: "d", assignee: "me", ...over,
} as Task);
const kb: KnowledgeBase = {
  sites: [
    { _id: "s-t0", tier: 0, priority: 70, status: "open" as const },
    { _id: "s-t0-hot", tier: 0, priority: 100, status: "open" as const },
    { _id: "s-t1", tier: 1, priority: 300, status: "open" as const },
    { _id: "s-closed", tier: 0, priority: 999, status: "closed" as const },
  ],
  needs: [{ _id: "n-done", tier: 0, priority: 999, status: "delivered" as const }],
};

// Tier first, then the record's current priority, not the priority the task was made with.
const a = rankOpen([task("t1", "s-t1"), task("t2", "s-t0"), task("t3", "s-t0-hot", { priority: 1 })], kb, "me", now);
assert.deepEqual(a.map((r) => r.task._id), ["t3", "t2", "t1"]);
console.log("ok  tier first, then the record's current priority (t3 beats t2 though it was made with a lower one)");

// Overdue beats everything.
const b = rankOpen([task("t3", "s-t0-hot"), task("late", "s-t1", { deadline: earlier })], kb, "me", now);
assert.equal(b[0].task._id, "late");
assert.equal(b[0].overdue, true);
console.log("ok  an overdue task ranks first, whatever its tier");

// Closed sites and delivered needs drop off. Other people's tasks drop off.
const c = rankOpen([task("gone", "s-closed"), task("need", "n-done", { recordType: "need" }), task("theirs", "s-t0", { assignee: "you" }), task("open", "s-t0")], kb, "me", now);
assert.deepEqual(c.map((r) => r.task._id), ["open"]);
console.log("ok  closed sites, delivered needs and other people's tasks are left out");

// Same tier and priority: the earlier deadline first.
const d = rankOpen([task("later", "s-t0", { deadline: later }), task("sooner", "s-t0", { deadline: new Date(now + 1000) })], kb, "me", now);
assert.equal(d[0].task._id, "sooner");
console.log("ok  ties go to the earlier deadline");
console.log("\n4 checks passed");
