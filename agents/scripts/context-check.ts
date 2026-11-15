// Offline check of the crowded-person context: no API, no database.
// A coordinator with 300 tasks, 120 incidents and 40 inbox items must give a bounded prompt,
// and ask_desk must page through the rest. Run: npx tsx agents/scripts/context-check.ts
import assert from "node:assert/strict";
import type { Incident, InboxItem, Task, User } from "@/lib/types";
import type { Board, UserContext } from "../desk/port";
import { askDesk } from "../desk/view";
import { contextBlock } from "../personal/turn";

const now = new Date();
const types: Task["type"][] = ["deliver", "call", "rescue", "notify"];
const tasks: Task[] = Array.from({ length: 300 }, (_, i) => ({
  _id: `t-${i}`, type: types[i % 4], recordType: "site", recordId: `s-${i}`, assignee: "coord-1", tried: [],
  risk: "low", tier: (i % 3) as Task["tier"], priority: 300 - i, status: "assigned", open: true,
  title: `Task ${i}`, detail: "detail", deadline: new Date(+now + (i % 5 - 2) * 60000), deskId: "d",
}) as unknown as Task);
const incidents: Incident[] = Array.from({ length: 120 }, (_, i) => ({
  _id: `inc-${i}`, deskId: "d", kind: i % 2 ? "road_blocked" : "short_supply", reportedBy: `u-${i}`,
  severity: (["critical", "high", "low"] as const)[i % 3], canContinue: true, text: "x", textEn: `problem ${i}`,
  status: "open", actions: [], history: [],
}));
const inbox: InboxItem[] = Array.from({ length: 40 }, (_, i) => ({
  _id: `ib-${i}`, userId: "coord-1", message: `msg ${i}`, status: "unread", ts: now,
  kind: i % 2 ? "task" : "approval", priority: 1,
}));
const user = { _id: "coord-1", name: "Coord", role: "coordinator", trust: "verified", region: "Battalgazi", deskId: "d" } as unknown as User;
const ctx: UserContext = {
  user, now, inbox, tasks, approvals: tasks.slice(0, 50), stuck: tasks.slice(50, 70), myNeeds: [], myIncidents: [], openIncidents: incidents,
  records: { sites: [], needs: [], roads: [], shelters: [] }, messages: [], postedThisSession: [],
  chatSummary: "The coordinator asked for a list of stuck deliveries; the agent named three.",
};

const block = contextBlock(ctx);
const lineCount = block.split("\n").length;
console.log(block.split("\n").filter((l) => l.includes("more not shown") || l.startsWith("Earlier")).join("\n"));
console.log(`\n${lineCount} lines, ${block.length} chars (~${Math.round(block.length / 4)} tokens) for 300 tasks + 120 incidents + 40 inbox`);
assert(lineCount < 75, "context block must stay bounded");
assert(block.includes("...and 292 more not shown"));
assert(block.includes("Earlier in this chat, summarized"));

const board = { sites: [], needs: [], roads: [], shelters: [], zones: [], incidents, tasks } as unknown as Board;
const p0 = askDesk({ board, events: [], role: "coordinator", topic: "mine", now, userId: "coord-1" });
const p24 = askDesk({ board, events: [], role: "coordinator", topic: "mine", now, userId: "coord-1", page: 24 });
const p99 = askDesk({ board, events: [], role: "coordinator", topic: "mine", now, userId: "coord-1", page: 99 });
console.log("\nask_desk mine page 0 ends:", p0.split("\n").at(-1));
console.log("ask_desk mine page 24:", p24.split("\n").length, "lines; last:", p24.split("\n").at(-1));
console.log("ask_desk mine page 99:", p99);
assert.equal(p0.split("\n").length, 13);
assert(p0.endsWith("(288 more; ask again with page 1)"));
assert.equal(p24.split("\n").length, 12);
assert(p99.includes("past the end"));
const sum = askDesk({ board, events: [], role: "coordinator", topic: "summary", now });
console.log("ask_desk summary:", sum.split("\n").length, "lines for 120 incidents");
assert(sum.split("\n").length < 20, "summary must stay bounded");
assert(!block.includes('"mine" lists them.\n  none') && block.includes("(16 approval, 16 task)."), "inbox has no ask_desk pointer");
const vol = askDesk({ board, events: [], role: "public", topic: "mine", now, userId: "coord-1" });
assert(vol.startsWith("Not available"));
console.log("\nall checks passed");
