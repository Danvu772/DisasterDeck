import { RoadCards } from "disaster-desk";
import { makeBoard } from "@/fixtures/board";

const now = Date.now();
const b = makeBoard(now);

export const Board = () => (
  <div style={{ display: "grid", gap: 12, maxWidth: 380 }}><RoadCards items={b.roads} now={now} /></div>
);
// A confirmed closure next to a single unconfirmed tweet (dashed border).
