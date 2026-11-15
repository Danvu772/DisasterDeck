import { AgentDesk } from "disaster-desk";
import { makeBoard } from "@/fixtures/board";
import { makeEvents, makeMessages, users } from "@/fixtures/desk";

const now = Date.now();
const b = makeBoard(now);
const byPriority = (a: { tier: number; priority: number }, c: { tier: number; priority: number }) =>
  a.tier - c.tier || c.priority - a.priority;

function deskFor(id: string) {
  const user = users.find((u) => u._id === id)!;
  return (
    <div style={{ display: "flex", height: 760, padding: 16 }}>
      <AgentDesk user={user} users={users} events={makeEvents(now)} messages={makeMessages(id, now)}
        tasks={b.tasks.filter((t) => t.open && t.assignee === id).sort(byPriority)}
        needs={b.needs.filter((n) => n.requestedBy.includes(id) && n.status !== "cancelled").sort(byPriority)}
        now={now} />
    </div>
  );
}

export const Volunteer = () => deskFor("zeynep");
// Volunteer: one call task, two needs she filed, a short chat with her agent.

export const FieldTeam = () => deskFor("team-4");
// Field team: an accepted rescue on top, no chat yet.
