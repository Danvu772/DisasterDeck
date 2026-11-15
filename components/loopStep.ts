import type { Site, Task } from "@/lib/types";

export const LOOP_LABELS = ["reported", "called back", "team approved", "team on site", "reported back"] as const;

// Where a site is in the loop, 1 to 5. Tasks are optional, without them step 3 cannot be seen.
export function loopStep(site: Site, tasks: Task[] = []): number {
  if (site.status === "closed") return 5;
  if (site.status === "team_on_site") return 4;
  const approved = tasks.some((t) =>
    t.type === "rescue" && t.recordType === "site" && t.recordId === site._id &&
    (t.status === "assigned" || t.status === "accepted"));
  if (approved) return 3;
  return site.callStatus === "verified" ? 2 : 1;
}

export function loopLine(site: Site, tasks?: Task[]): string {
  const n = loopStep(site, tasks);
  return `Step ${n} of 5: ${LOOP_LABELS[n - 1]}.`;
}
