// /lab: every primitive in every state, from fixtures. Change a token in globals.css,
// refresh, look at everything at once. New screen ideas go in app/lab/<name>/page.tsx.
import { makeBoard } from "@/fixtures/board";
import {
  IncidentCards, NeedCards, RoadCards, ShelterCards, SiteCards, TaskCards,
} from "@/components/BoardCards";
import { HealthLine } from "@/components/HealthLine";
import { ChatLine } from "@/components/ChatLine";
import { HealthPill } from "@/components/StatusPill";
import { chip, pill, statusTag, tierBadge, tierText } from "@/components/encode";
import type { Tier } from "@/lib/types";
import { MetricChartsDemo } from "@/components/metrics/charts/MetricChartsDemo";

export const dynamic = "force-dynamic";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export default function Lab() {
  const now = Date.now();
  const b = makeBoard(now);

  return (
    <main className="mx-auto max-w-6xl p-4 md:p-6">
      <header className="flex items-center gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Lab</h1>
        <span className={pill}>Fixtures</span>
      </header>

      <div className="mt-6 grid gap-8 md:grid-cols-3">
        <Section title="Sites"><SiteCards items={b.sites} now={now} /></Section>
        <Section title="Needs"><NeedCards items={b.needs} now={now} /></Section>
        <Section title="Shelters"><ShelterCards items={b.shelters} now={now} /></Section>
        <Section title="Roads"><RoadCards items={b.roads} now={now} /></Section>
        <Section title="Incidents"><IncidentCards items={b.incidents} now={now} /></Section>
        <Section title="Tasks"><TaskCards items={b.tasks} now={now} /></Section>

        <Section title="Chat">
          <div className="space-y-1 rounded-xl border bg-card p-3 shadow-xs">
            <ChatLine name="Zeynep" m={{ from: "user", text: "called, voices heard" }} />
            <ChatLine name="Zeynep" m={{ from: "agent", text: "Marked Örnek St. 12 as verified. Asking the coordinator to send Saha Ekibi A." }} />
          </div>
        </Section>

        <Section title="Status pill">
          <div className="flex flex-wrap gap-2">
            <HealthPill health={{ pending: 0, lastLoopAt: new Date(now) }} now={now} />
            <HealthPill health={{ pending: 1, oldestPendingSeconds: 5760, lastLoopAt: new Date(now - 600000) }} now={now} />
            <HealthPill health={{}} live={false} now={now} />
          </div>
        </Section>

        <Section title="Chips and pills">
          <div className="flex flex-wrap gap-2">
            <span className={chip(true)}>All <span className="font-mono">12</span></span>
            <span className={chip(false)}>Sites <span className="font-mono">5</span></span>
            <span className={chip(false)}>Needs <span className="font-mono">3</span></span>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={pill}>Demo data</span>
            <span className={pill}><span className="font-mono">4</span> of <span className="font-mono">9</span> on the map</span>
            <span className={statusTag}>Verified</span>
          </div>
        </Section>

        <Section title="Tier badges">
          <div className="flex flex-wrap gap-2">
            {([0, 1, 2] as Tier[]).map((t) => (
              <span key={t} className={`inline-flex h-5 items-center rounded-full px-2 text-xs font-medium ${tierBadge(t)}`}>
                {tierText(t).word}
              </span>
            ))}
          </div>
        </Section>

        <div className="md:col-span-3">
          <Section title="Metric charts"><MetricChartsDemo /></Section>
        </div>

        <Section title="Health">
          <HealthLine {...b.health} />
          <HealthLine pending={41} oldestPendingSeconds={47} />
        </Section>
      </div>
    </main>
  );
}
