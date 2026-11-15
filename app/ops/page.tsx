// /ops: the operations room for whoever runs the desk. Posts streaming in, what the desk made of
// each one, the map they build, and the numbers. Live from GET /api/events, else the exercise replay.
import { OpsRoom } from "@/components/ops/OpsRoom";

export const dynamic = "force-dynamic";

export default function OpsPage() {
  return <OpsRoom />;
}
