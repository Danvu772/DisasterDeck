// Extra tasks for the coordinator screen, kept out of fixtures/board.ts on purpose.
// One escalated task (nobody fits) and one approval that is still inside its deadline,
// so the screen shows both the red and the calm state. Every name and number is made up.
import type { Task } from "@/lib/types";

const DESK = "malatya-2023";

export function makeCoordinatorTasks(now: number): Task[] {
  const ago = (min: number) => new Date(now - min * 60000);
  return [
    {
      _id: "task-8", type: "rescue", recordType: "site", recordId: "site-57",
      tried: [], risk: "high", tier: 0, priority: 54, status: "waiting_approval", open: true,
      title: "Send Army Team 2 to Örnek St. 12", detail: "1 person under rubble, nobody answers the phone. Team 2 is 900 m away and free.",
      deadline: new Date(now + 4 * 60000),
      history: [{ ts: ago(1), by: "dispatcher", source: "system", reason: "Rescue is high risk, sent to every coordinator" }],
      deskId: DESK,
    },
    {
      _id: "task-7", type: "assist", recordType: "incident", recordId: "inc-1",
      tried: ["team-2", "zeynep"], risk: "low", tier: 0, priority: 58, status: "escalated", open: true,
      title: "Fix the van at km 14", detail: "Kızılay depot 2 has a flat tire. Needs someone with tools.",
      deadline: new Date(now + 10 * 60000),
      history: [
        { ts: ago(2), by: "help-desk", source: "system", reason: "Assist task for the nearest person with tools" },
        { ts: ago(1), by: "dispatcher", source: "system", reason: "Nobody free has tools or a vehicle within 10 km" },
      ],
      deskId: DESK,
    },
  ];
}
