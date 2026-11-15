import { makeBoard } from "@/fixtures/board";
import { VolunteerV2 } from "@/components/v2/VolunteerV2";

export const dynamic = "force-dynamic";

// ?user=<id> is who is talking (demo mode only).
export default async function V2VolunteerPage({ searchParams }: { searchParams: Promise<{ user?: string }> }) {
  const { user } = await searchParams;
  return <VolunteerV2 initial={{ ...makeBoard(Date.now()), zones: [] }} userId={user || "volunteer-callback"} />;
}
