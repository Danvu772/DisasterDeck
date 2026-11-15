// v1's "People on the desk" cards as one line of name pills. Each still opens that person's agent.
// The card's other lines (role, trust, region, open tasks and needs) moved into the pill's title.
import Link from "next/link";
import { users } from "@/fixtures/desk";
import type { Board } from "../BoardCards";

export function PeopleStrip({ board }: { board: Board }) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap">
      <h2 className="shrink-0 text-xs text-muted">On the desk</h2>
      {users.map((u) => {
        const tasks = board.tasks.filter((t) => t.open && t.assignee === u._id).length;
        const needs = board.needs.filter((n) => n.requestedBy.includes(u._id) && n.status !== "delivered").length;
        return (
          <Link key={u._id} href={`/agent?user=${u._id}`}
            title={`${u.role}, ${u.trust}, ${u.region}. ${u.status}. ${tasks} ${tasks === 1 ? "task" : "tasks"}, ${needs} ${needs === 1 ? "need" : "needs"}.`}
            className="shrink-0 rounded-pill border border-line bg-card px-2.5 py-0.5 text-sm font-bold text-primary underline hover:border-primary hover:text-primary-dark">
            {u.name}
          </Link>
        );
      })}
    </div>
  );
}
