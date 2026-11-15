// /field?user=<id>: the field team's phone view. Default user is the seeded field team.
// Polls GET /api/board. Until that route answers it shows the demo board and says so.
import { makeFieldBoard } from "@/fixtures/field";
import { FieldPhone } from "@/components/field/FieldPhone";

export const dynamic = "force-dynamic";

export default async function FieldPage({ searchParams }: { searchParams: Promise<{ user?: string }> }) {
  const { user } = await searchParams;
  const id = user || "field-alpha";
  return <FieldPhone key={id} user={id} initial={makeFieldBoard(Date.now())} />;
}
