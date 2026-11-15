import { NeedCards } from "disaster-desk";
import { makeBoard } from "@/fixtures/board";

const now = Date.now();
const b = makeBoard(now);

export const Board = () => (
  <div style={{ display: "grid", gap: 12, maxWidth: 380 }}><NeedCards items={b.needs} now={now} /></div>
);
// Life-threatening blankets on the way, team food, a proposed need at 1 of 3 asks (progress dots).
