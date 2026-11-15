import { IncidentCards } from "disaster-deck";
import { makeBoard } from "@/fixtures/board";

const now = Date.now();
const b = makeBoard(now);

export const Critical = () => (
  <div style={{ display: "grid", gap: 12, maxWidth: 380 }}><IncidentCards items={b.incidents} now={now} /></div>
);
// Critical breakdown: red bar, the Turkish original under the English, the desk's actions in mono.
