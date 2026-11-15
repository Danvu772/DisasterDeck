// Shown while a route's server render waits on the database. The desk reads the board before first paint,
// so without this the page stays blank until the query answers.
import { BoardSkeleton } from "@/components/ui";

export default function Loading() {
  return <BoardSkeleton />;
}
