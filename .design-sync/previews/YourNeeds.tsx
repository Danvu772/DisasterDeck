import { YourNeeds } from "disaster-desk";
import { makeBoard } from "@/fixtures/board";

const now = Date.now();
const b = makeBoard(now);
const byPriority = (a: { tier: number; priority: number }, c: { tier: number; priority: number }) =>
  a.tier - c.tier || c.priority - a.priority;
const mine = (id: string) => b.needs.filter((n) => n.requestedBy.includes(id)).sort(byPriority);

export const FieldTeam = () => <div style={{ maxWidth: 420 }}><YourNeeds needs={mine("team-4")} now={now} /></div>;
// Field team: life-threatening blankets on the way, team food assigned.

export const Volunteer = () => <div style={{ maxWidth: 420 }}><YourNeeds needs={mine("zeynep")} now={now} /></div>;
// Volunteer: a proposed need waiting on 2 more asks.

export const Empty = () => <div style={{ maxWidth: 420 }}><YourNeeds needs={[]} now={now} /></div>;
