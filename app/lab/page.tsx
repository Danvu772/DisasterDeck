// /lab: every primitive in every state, from fixtures. Change a token in globals.css,
// refresh, look at everything at once. New screen ideas go in app/lab/<name>/page.tsx.
import { makeBoard } from "@/fixtures/board";
import {
  IncidentCards, NeedCards, RoadCards, ShelterCards, SiteCards, TaskCards,
} from "@/components/BoardCards";
import { HealthLine } from "@/components/HealthLine";
import { ChatLine } from "@/components/ChatLine";

export const dynamic = "force-dynamic";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-lg font-bold">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export default function Lab() {
  const now = Date.now();
  const b = makeBoard(now);

  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-bold">Lab</h1>
      <p className="text-sm text-muted">Fixtures only. Tier is the bar colour, confidence is the border, the bold name says who acted.</p>

      <div className="mt-6 grid gap-6 md:grid-cols-3">
        <Section title="Sites"><SiteCards items={b.sites} now={now} /></Section>
        <Section title="Needs"><NeedCards items={b.needs} now={now} /></Section>
        <Section title="Shelters"><ShelterCards items={b.shelters} now={now} /></Section>
        <Section title="Roads"><RoadCards items={b.roads} now={now} /></Section>
        <Section title="Incidents"><IncidentCards items={b.incidents} now={now} /></Section>
        <Section title="Tasks"><TaskCards items={b.tasks} now={now} /></Section>

        <Section title="Chat">
          <div className="space-y-1 rounded-card border border-line bg-card p-3">
            <ChatLine name="Zeynep" m={{ from: "user", text: "called, voices heard" }} />
            <ChatLine name="Zeynep" m={{ from: "agent", text: "Marked Örnek St. 12 as verified. Asking the coordinator to send Team 4." }} />
          </div>
        </Section>

        <Section title="Health">
          <HealthLine {...b.health} />
          <HealthLine pending={41} oldestPendingSeconds={47} />
        </Section>
      </div>
    </main>
  );
}
