import { makeBoard } from "@/fixtures/board";
import { FieldV2 } from "@/components/v2/FieldV2";

export const dynamic = "force-dynamic";

// The field team phone. ?user=<id> is the team (demo mode only). Open it on a phone over HTTPS for talking.
export default async function V2FieldPage({ searchParams }: { searchParams: Promise<{ user?: string }> }) {
  const { user } = await searchParams;
  return <FieldV2 initial={{ ...makeBoard(Date.now()), zones: [] }} userId={user || "field-alpha"} />;
}
