import { makeBoard } from "@/fixtures/board";
import { makeEvents } from "@/fixtures/desk";
import { BoardV2 } from "@/components/v2/BoardV2";

export const dynamic = "force-dynamic";

// Starts from the fixture desk, then polls /api/board and /api/events every second or two.
export default function V2BoardPage() {
  const now = Date.now();
  return <BoardV2 initial={{ ...makeBoard(now), zones: [] }} initialFeed={makeEvents(now)} />;
}
