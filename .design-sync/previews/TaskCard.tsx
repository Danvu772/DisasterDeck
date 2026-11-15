import { TaskCard } from "disaster-deck";
import { makeBoard } from "@/fixtures/board";

const now = Date.now();
const b = makeBoard(now);
const task = (id: string) => b.tasks.find((t) => t._id === id)!;
const col = { display: "grid", gap: 12, maxWidth: 380 } as const;

export const Assigned = () => <div style={col}><TaskCard task={task("task-1")} now={now} /></div>;
// Assigned call, deadline still ahead. Problem is the only red button in the app.

export const Overdue = () => <div style={col}><TaskCard task={task("task-2")} now={now} /></div>;
// Past deadline and unassigned: the bar goes red and "overdue" shows.

export const Accepted = () => <div style={col}><TaskCard task={task("task-5")} now={now} /></div>;
// Accepted by a field team, approved by the coordinator.
