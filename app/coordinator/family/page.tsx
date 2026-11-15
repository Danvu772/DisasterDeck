import { FamilyUpdates } from "@/components/voice/FamilyUpdates";
export const dynamic = "force-dynamic";
export default async function FamilyUpdatesPage({ searchParams }: { searchParams: Promise<{ user?: string }> }) {
  const { user } = await searchParams;
  return <main className="mx-auto max-w-4xl space-y-5 p-6"><h1 className="text-3xl font-bold">Family voice updates</h1>
    <p className="text-muted">Publish only information you have verified and have permission to share with this family. The voice assistant cannot read the full operational board or dispatch help. Access expires after 24 hours.</p>
    <FamilyUpdates userId={user || "coordinator-duty"} /></main>;
}
