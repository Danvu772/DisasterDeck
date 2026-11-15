// Landing: who is on the desk (click a person to open their agent), then the shared board.
// The server renders the fixture board, LiveBoard swaps in /api/board once it answers.
import { makeBoard } from "@/fixtures/board";
import { LiveBoard } from "@/components/LiveBoard";

export const dynamic = "force-dynamic";

export default function Desk() {
  return (
    <LiveBoard initial={makeBoard(Date.now())} />
  );
}
