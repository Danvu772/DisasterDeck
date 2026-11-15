import { ShelterCards } from "disaster-deck";
import { makeBoard } from "@/fixtures/board";

const now = Date.now();
const b = makeBoard(now);

export const Board = () => (
  <div style={{ display: "grid", gap: 12, maxWidth: 380 }}><ShelterCards items={b.shelters} now={now} /></div>
);
// Shelter A is over 90% full (amber) and its photo is 2 h old (stale). Shelter B has room.
