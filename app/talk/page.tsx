// /talk — voice first: one person and their own agent. Owner: Role 2.
// ?user=<id> picks the person (demo; the login decides once SSOJet is on). The task card and the
// aftershock strip come from the same desk the agent reads, so the screen and the agent agree.
import { desk } from "@/agents/desk";
import { quakeLine, recentQuakesNear } from "@/agents/research/quakes";
import { voiceEnabled } from "@/agents/shared/voice";
import { plainDetail } from "@/components/detail/fields";
import { shared } from "@/lib/shared";
import { TalkScreen, type TalkPerson, type TalkQuake, type TalkTask } from "@/components/talk/TalkScreen";

export const dynamic = "force-dynamic";

// The people worth talking as in the demo, one per role. Others work through ?user= too.
const DEMO_PEOPLE = ["field-alpha", "volunteer-callback", "supplier-primary", "shelter-desk", "coordinator-duty", "public-demo"];

// The aftershock strip must not hold the page: a cold AFAD/USGS fetch can take seconds (10 s
// timeout). Wait at most QUAKE_WAIT_MS; the fetch goes on and the 30 s refresh shows it (speed, 15 Nov).
const QUAKE_WAIT_MS = 400;
const CTX_STALE_MS = 5 * 60_000;
const late = <T,>(ms: number) => new Promise<undefined>((r) => setTimeout(r, ms)) as Promise<T | undefined>;

export default async function TalkPage({ searchParams }: { searchParams: Promise<{ user?: string }> }) {
  const { user: wanted } = await searchParams;
  const d = desk();
  const all = await shared("talk-users", 30_000, () => d.listUsers(), 10 * 60_000);
  const people: TalkPerson[] = DEMO_PEOPLE
    .map((id) => all.find((u) => u._id === id))
    .filter((u): u is NonNullable<typeof u> => Boolean(u))
    .map((u) => ({ id: u._id, name: u.name, role: u.role }));
  const meId = wanted && all.some((u) => u._id === wanted) ? wanted : people[0]?.id ?? "field-alpha";

  const nearFor = (c: Parameters<typeof recentQuakesNear>[0]) =>
    Promise.race([recentQuakesNear(c, 60).catch(() => undefined), late<Awaited<ReturnType<typeof recentQuakesNear>>>(QUAKE_WAIT_MS)]);
  // The person's context (chat, inbox, the whole board) takes seconds to read cold. The screen only
  // shows their tasks, so a copy up to CTX_STALE_MS old answers at once while a fresh one loads;
  // the 30 s refresh then shows it (speed, 15 Nov).
  const ctx = await shared(`talk-ctx:${meId}`, 5_000, () => d.getUserContext(meId), CTX_STALE_MS);
  const tasks: TalkTask[] = ctx.tasks.slice(0, 5).map((t) => ({
    id: t._id, title: t.title, detail: plainDetail(t.detail).replace(/\d[\d\s]{8,}\d/g, "•••"), tier: t.tier, status: t.status,
  }));
  const near = await nearFor(ctx.user.coords);
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
