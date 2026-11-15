import { FamilyUpdates } from "@/components/voice/FamilyUpdates";
export const dynamic = "force-dynamic";
export default async function FamilyUpdatesPage({ searchParams }: { searchParams: Promise<{ user?: string }> }) {
  const { user } = await searchParams;
  return <main className="mx-auto max-w-4xl space-y-5 p-6"><h1 className="text-3xl font-bold">Family voice updates</h1>
    <p className="text-muted">Publish a verified update for anyone to find by name, read or ask about by voice. Visitors do not need login or access codes. The voice assistant uses published updates and cannot dispatch help. Publications expire after 24 hours.</p>
    <FamilyUpdates userId={user || "coordinator-duty"} /></main>;
}
