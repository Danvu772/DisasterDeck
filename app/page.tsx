// Landing: the shared board. List, map with the desk feed under it, and the selected record.
// The server renders the fixture board and feed, LiveBoard swaps in /api/board and /api/events once they answer.
import { makeBoard } from "@/fixtures/board";
import { makeEvents } from "@/fixtures/desk";
import { LiveBoard } from "@/components/LiveBoard";

export const dynamic = "force-dynamic";

export default function Desk() {
  const now = Date.now();
  return (
    <LiveBoard initial={makeBoard(now)} initialFeed={makeEvents(now)} />
  );
}
