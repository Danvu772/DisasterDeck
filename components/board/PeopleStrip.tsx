// Who is on the desk, as small avatars. Each one opens that person's agent; the tooltip says what they hold.
import Link from "next/link";
import { users } from "@/fixtures/desk";
import type { Board } from "../BoardCards";
import { plural } from "../detail/fields";

const ROLE_WORD: Record<string, string> = {
  volunteer: "Volunteer", field: "Field team", supplier: "Supplier", shelter: "Shelter", coordinator: "Coordinator", public: "Public",
};

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

export function PeopleStrip({ board }: { board: Board }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-xs text-muted-foreground">On the desk</h2>
      <div className="flex items-center -space-x-1.5">
        {users.map((u) => {
          const tasks = board.tasks.filter((t) => t.open && t.assignee === u._id).length;
          const away = u.status === "offline";
          return (
            <Link key={u._id} href={`/agent?user=${u._id}`} aria-label={u.name}
              title={`${u.name} · ${ROLE_WORD[u.role] ?? u.role} · ${plural(tasks, "open task", "open tasks")}`}
              className={`relative grid size-7 place-items-center rounded-full bg-secondary text-[10px] font-semibold text-secondary-foreground ring-2 ring-card transition-transform hover:z-10 hover:-translate-y-0.5 ${away ? "opacity-50" : ""}`}>
              {initials(u.name)}
              {tasks > 0 && (
                <span aria-hidden className="absolute -right-0.5 -top-0.5 grid size-3.5 place-items-center rounded-full bg-primary font-mono text-[9px] text-primary-foreground ring-2 ring-card">{tasks}</span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
