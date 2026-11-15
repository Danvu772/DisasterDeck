// /demo: the presenter's screen. The six steps of the pitch, read live from the board and the feed.
// Fixtures show until /api/board answers, and the screen says so.
import { makeBoard } from "@/fixtures/board";
import { DemoScreen } from "@/components/demo/DemoScreen";

export const dynamic = "force-dynamic";

export default function DemoPage() {
  return <DemoScreen initial={makeBoard(Date.now())} />;
}
