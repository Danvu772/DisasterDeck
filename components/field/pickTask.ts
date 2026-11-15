// Board in, the one thing this person does next out. Pure, so any API shape that has
// tasks, sites and needs works.
import type { Need, Site, Task } from "@/lib/types";

export interface FieldBoard { tasks: Task[]; sites: Site[]; needs: Need[] }

export interface FieldTask {
  task: Task;
  place: string;          // the address, or what to bring and where
  people: string;         // "3 people", or that nobody knows yet
  caseId: string;         // the record the task is about
}

export function pickTask(board: FieldBoard, user: string): FieldTask | null {
  const task = board.tasks
    .filter((t) => t.open && t.assignee === user)
    .sort((a, b) => a.tier - b.tier || b.priority - a.priority)[0];
  if (!task) return null;

  const site = (id?: string) => board.sites.find((s) => s._id === id);
  let place = "Address not known yet";
  let people = "Number of people not known";

  if (task.recordType === "site") {
    const s = site(task.recordId);
    if (s) {
      place = s.address;
      if (s.peopleTrapped > 0) people = `${s.peopleTrapped} ${s.peopleTrapped === 1 ? "person" : "people"}`;
    }
  } else if (task.recordType === "need") {
    const n = board.needs.find((x) => x._id === task.recordId);
    if (n) {
      const s = site(n.siteIds[0]);
      place = s ? `${n.quantity} ${n.item} to ${s.address}` : `${n.quantity} ${n.item}, ${n.region}`;
      if (s && s.peopleTrapped > 0) people = `${s.peopleTrapped} ${s.peopleTrapped === 1 ? "person" : "people"}`;
    }
  }
  return { task, place, people, caseId: task.recordId };
}
