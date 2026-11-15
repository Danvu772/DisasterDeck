// /voice: the voice agent, hands-free audio control of one person's own agent.
// ?user=<id> picks the person (demo only, the login decides once SSOJet is on).
import { VoiceAgent } from "@/components/voice/VoiceAgent";
import { users } from "@/fixtures/desk";

export const dynamic = "force-dynamic";

export default async function VoicePage({ searchParams }: { searchParams: Promise<{ user?: string }> }) {
  const { user: id } = await searchParams;
  const user = users.find((u) => u._id === id) ?? users[0];
  return <VoiceAgent key={user._id} user={user} users={users} />;
}
