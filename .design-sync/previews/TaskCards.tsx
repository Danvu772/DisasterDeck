import { TaskCards } from "disaster-deck";
import { makeBoard } from "@/fixtures/board";

const now = Date.now();
const b = makeBoard(now);

export const Board = () => (
  <div style={{ display: "grid", gap: 12, maxWidth: 380 }}><TaskCards items={b.tasks} now={now} /></div>
);
// The task list as the board renders it: assigned call, overdue approval, accepted rescue.
