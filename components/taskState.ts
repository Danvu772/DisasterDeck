// What a task card shows between the button press and the desk catching up. Pure, so /field and
// /coordinator can reuse it. The local status is a guess that the board's own status replaces.
import type { Task } from "@/lib/types";
import type { TaskAction } from "./taskEvents";

export type LocalStatus = "accepted" | "declined" | "done" | "problem_reported";

export interface LocalTask {
  status: LocalStatus;
  base: Task["status"]; // the board's status when the button was pressed
  title: string;
  pending: boolean;     // a real post is in flight, every button on the card stays locked
  demo: boolean;        // nothing was posted, the result lives on this screen only
}

// Real means the live board lists it. Fixture ids like task-1 are not in Atlas, so they are demo.
// liveBoard is null while /api/board is not answering.
export function isRealTask(id: string, liveBoard: { tasks: { _id: string }[] } | null | undefined): boolean {
  return !!liveBoard && liveBoard.tasks.some((t) => t._id === id);
}

export function nextLocalStatus(a: TaskAction): LocalStatus {
  return a === "problem" ? "problem_reported" : a;
}

// The task as the card should draw it. Once the board's status moves off `base`, the board wins.
// Done and declined close the task, so it leaves the open list.
export function viewTask(task: Task, local?: LocalTask): { task: Task; reported: boolean } {
  if (!local || task.status !== local.base) return { task, reported: false };
  if (local.status === "problem_reported") return { task, reported: true };
  return { task: { ...task, status: local.status, open: local.status === "accepted" }, reported: false };
}

const byPriority = (a: { tier: number; priority: number }, b: { tier: number; priority: number }) =>
  a.tier - b.tier || b.priority - a.priority;

export function openTasksFor(tasks: Task[], userId: string): Task[] {
  return tasks.filter((t) => t.open && t.assignee === userId).sort(byPriority);
}

export function needsFor<N extends { requestedBy: string[]; status: string; tier: number; priority: number }>(
  needs: N[], userId: string,
): N[] {
  return needs.filter((n) => n.requestedBy.includes(userId) && n.status !== "cancelled").sort(byPriority);
}
