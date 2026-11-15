// /talk — voice first: one person and their own agent. Owner: Role 2.
// ?user=<id> picks the person (demo; the login decides once SSOJet is on). The task card and the
// aftershock strip come from the same desk the agent reads, so the screen and the agent agree.
import { desk } from "@/agents/desk";
import { quakeLine, recentQuakesNear } from "@/agents/research/quakes";
import { voiceEnabled } from "@/agents/shared/voice";
import { TalkScreen, type TalkPerson, type TalkQuake, type TalkTask } from "@/components/talk/TalkScreen";

export const dynamic = "force-dynamic";

// The people worth talking as in the demo, one per role. Others work through ?user= too.
const DEMO_PEOPLE = ["field-alpha", "volunteer-callback", "supplier-primary", "shelter-desk", "coordinator-duty", "public-demo"];

export default async function TalkPage({ searchParams }: { searchParams: Promise<{ user?: string }> }) {
  const { user: wanted } = await searchParams;
  const d = desk();
  const all = await d.listUsers();
  const people: TalkPerson[] = DEMO_PEOPLE
    .map((id) => all.find((u) => u._id === id))
    .filter((u): u is NonNullable<typeof u> => Boolean(u))
    .map((u) => ({ id: u._id, name: u.name, role: u.role }));
  const meId = wanted && all.some((u) => u._id === wanted) ? wanted : people[0]?.id ?? "field-alpha";

  const ctx = await d.getUserContext(meId);
  const tasks: TalkTask[] = ctx.tasks.slice(0, 5).map((t) => ({
    id: t._id, title: t.title, detail: t.detail.replace(/\d[\d\s]{8,}\d/g, "•••"), tier: t.tier, status: t.status,
  }));
  const near = await recentQuakesNear(ctx.user.coords, 60).catch(() => undefined);
  const quakes: TalkQuake[] = (near?.quakes ?? []).map((q) => ({ line: quakeLine(q), mag: q.mag, minutesAgo: q.minutesAgo }));

  return (
    <TalkScreen
      me={{ id: ctx.user._id, name: ctx.user.name, role: ctx.user.role }}
      people={people}
      tasks={tasks}
      quakes={quakes}
      voiceOn={voiceEnabled()}
    />
  );
}
