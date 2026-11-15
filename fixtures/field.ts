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
    deskId: "malatya-2023",
  };
  return { ...board, tasks: [...board.tasks, task] };
}
