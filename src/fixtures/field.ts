// The demo board for /field. makeBoard() has no task for the seeded field team, so this adds
// one for field-alpha. Made up, like everything in fixtures/.
import type { Task } from "@/lib/types";
import { makeBoard } from "./board";

export function makeFieldBoard(now: number) {
  const board = makeBoard(now);
  const task: Task = {
    _id: "task-9", type: "rescue", recordType: "site", recordId: "site-57", assignee: "field-alpha",
    tried: [], risk: "high", tier: 0, priority: 54, status: "assigned", open: true,
    title: "Rescue at Örnek St. 12",
    detail: "One woman under the rubble, 4 people posted about her. Second floor, back of the building. Approved by Demo Nöbetçi Koordinatör.",
    deadline: new Date(now + 10 * 60000),
    history: [
      { ts: new Date(now - 3 * 60000), by: "dispatcher", source: "system", reason: "Nearest free field team, 1.2 km away" },
      { ts: new Date(now - 2 * 60000), by: "Demo Nöbetçi Koordinatör", source: "person", reason: "Approved dispatch" },
    ],
    deskId: "antakya-2023",
  };
  // Two more for the same team, so the "Your other tasks" list shows in demo mode.
  const deliver: Task = {
    _id: "task-10", type: "deliver", recordType: "need", recordId: "need-4", assignee: "field-alpha",
    tried: [], risk: "low", tier: 1, priority: 41, status: "assigned", open: true,
    title: "Bring food for the team to Çınar St. 3",
    detail: "6 meals for the team on site. Pick them up at Demo Depo A.",
    deadline: new Date(now + 25 * 60000),
    history: [{ ts: new Date(now - 5 * 60000), by: "dispatcher", source: "system", reason: "On the way to Çınar St. 3 anyway" }],
    deskId: "antakya-2023",
  };
  const call: Task = {
    _id: "task-11", type: "call", recordType: "site", recordId: "site-61", assignee: "field-alpha",
    tried: [], risk: "low", tier: 1, priority: 33, status: "assigned", open: true,
    title: "Call back about Kale",
    detail: "Someone posted from near the mosque, nobody has confirmed anyone is trapped.",
    deadline: new Date(now - 4 * 60000),
    history: [{ ts: new Date(now - 14 * 60000), by: "dispatcher", source: "system", reason: "Nobody else free to call" }],
    deskId: "antakya-2023",
  };
  return { ...board, tasks: [...board.tasks, task, deliver, call] };
}
