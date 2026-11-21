// Landing: the shared board. List, map with the desk feed under it, and the selected record.
// The server reads the board and the feed from the database, so the first paint is the real desk.
// Only when the database cannot be reached does it fall back to the fixture board, labelled
// "Demo data". middleware.ts gates this page the same way canRead gates /api/board.
import { makeBoard } from "@/fixtures/board";
import { makeEvents } from "@/fixtures/desk";
import { LiveBoard } from "@/components/LiveBoard";
import type { FeedEvent } from "@/components/board/DeskFeed";
import { deskId } from "@/lib/db";
import { boardJson } from "@/lib/shared";
import { latestFeed } from "@/lib/feed";

export const dynamic = "force-dynamic";

// JSON round trip: the client then holds the same shape the polls return (dates as ISO strings).
const asJson = <T,>(x: unknown): T => JSON.parse(JSON.stringify(x)) as T;

export default async function Desk() {
  try {
    const [board, feed] = await Promise.all([boardJson(deskId()), latestFeed(30)]);
    return (
      <LiveBoard initial={JSON.parse(board) as ReturnType<typeof makeBoard>} initialFeed={asJson<FeedEvent[]>(feed)} initialLive />
    );
  } catch (err) {
    console.error("first paint: database not reachable, showing the fixture board:", err instanceof Error ? err.message : err);
    const now = Date.now();
    return <LiveBoard initial={makeBoard(now)} initialFeed={makeEvents(now)} />;
  }
}
