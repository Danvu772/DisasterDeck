import { SiteCards } from "disaster-desk";
import { makeBoard } from "@/fixtures/board";

const now = Date.now();
const b = makeBoard(now);

export const Board = () => (
  <div style={{ display: "grid", gap: 12, maxWidth: 380 }}><SiteCards items={b.sites} now={now} /></div>
);
// Every site on the board: a 4-source tweet cluster, a verified site with a team, an unconfirmed rumour.
