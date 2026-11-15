import { BoardTabs } from "disaster-deck";
import { makeBoard } from "@/fixtures/board";

const now = Date.now();
const b = makeBoard(now);

export const Sites = () => <div style={{ maxWidth: 1100 }}><BoardTabs board={b} now={now} /></div>;
// The shared board. Red counts on a tab = act-now items hidden behind it.

export const Needs = () => <div style={{ maxWidth: 1100 }}><BoardTabs board={b} now={now} initial="needs" /></div>;

export const Tasks = () => <div style={{ maxWidth: 1100 }}><BoardTabs board={b} now={now} initial="tasks" /></div>;
