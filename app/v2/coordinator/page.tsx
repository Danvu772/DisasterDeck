import { makeBoard } from "@/fixtures/board";
import { CoordinatorV2 } from "@/components/v2/CoordinatorV2";

export const dynamic = "force-dynamic";

// ?user=<id> is who presses the buttons (demo mode only).
export default async function V2CoordinatorPage({ searchParams }: { searchParams: Promise<{ user?: string }> }) {
  const { user } = await searchParams;
  return <CoordinatorV2 initial={{ ...makeBoard(Date.now()), zones: [] }} userId={user || "coordinator-duty"} />;
}
