// /lab: every primitive in every state, from fixtures. Change a token in globals.css,
// refresh, look at everything at once. New screen ideas go in app/lab/<name>/page.tsx.
import { makeBoard } from "@/fixtures/board";
import { RecordCard } from "@/components/RecordCard";
import { TaskCard } from "@/components/TaskCard";
import { HealthLine } from "@/components/HealthLine";
import { ChatLine } from "@/components/ChatLine";

export const dynamic = "force-dynamic";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 font-mono text-xs uppercase tracking-wide text-muted">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export default function Lab() {
  const now = Date.now();
  const b = makeBoard(now);

  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="text-xl font-semibold">Lab</h1>
      <p className="text-sm text-muted">Fixtures only. Tier = bar colour, confidence = border, machine = mono.</p>

      <div className="mt-6 grid gap-6 md:grid-cols-3">
        <Section title="Sites">
          {b.sites.map((s) => (
            <RecordCard key={s._id} type="site" title={s.address}
              detail={`${s.peopleTrapped} ${s.peopleTrapped === 1 ? "person" : "people"} · call: ${s.callStatus.replace("_", " ")}`}
              tier={s.tier} priority={s.priority} confidence={s.confidence} status={s.status}
              at={s.observedAt} source={s.sources[0]?.source} sources={s.sources.length}
              history={s.history} now={now} />
          ))}
        </Section>

        <Section title="Needs">
          {b.needs.map((n) => (
            <RecordCard key={n._id} type="need" title={`${n.quantity} ${n.item}`} detail={n.region}
              tier={n.tier} priority={n.priority} confidence={n.confidence} status={n.status}
              at={new Date(now)} now={now}>
              {n.status === "proposed" && (
                <p className="mt-1 font-mono text-xs text-muted">
                  {"●".repeat(n.support)}{"○".repeat(Math.max(0, 3 - n.support))} {n.support} of 3 asked
                </p>
              )}
            </RecordCard>
          ))}
        </Section>

        <Section title="Shelters">
          {b.shelters.map((s) => (
            <RecordCard key={s._id} type="shelter" title={s.name}
              tier={s.bedsUsed / s.bedsTotal > 0.9 ? 1 : 2} confidence="confirmed"
              status={`${s.bedsUsed}/${s.bedsTotal}`} at={s.observedAt} source="instagram" now={now}>
              <div className="mt-2 h-1.5 w-full rounded bg-line">
                <div className="h-1.5 rounded bg-ink" style={{ width: `${(100 * s.bedsUsed) / s.bedsTotal}%` }} />
              </div>
            </RecordCard>
          ))}
        </Section>

        <Section title="Roads">
          {b.roads.map((r) => (
            <RecordCard key={r._id} type="road" title={r.road} detail={r.reason} tier={1}
              confidence={r.confidence} status={r.state} at={r.observedAt} source="person" now={now} />
          ))}
        </Section>

        <Section title="Incidents">
          {b.incidents.map((i) => (
            <RecordCard key={i._id} type="incident" title={i.kind.replace("_", " ")} detail={i.textEn}
              tier={0} actNow={i.severity === "critical"} confidence="confirmed" status={i.status}
              at={i.actions[0].ts} source="person" now={now}>
              <p className="mt-1 text-xs italic text-muted">{i.text}</p>
              <ul className="mt-2 space-y-0.5 font-mono text-xs">
                {i.actions.map((a, k) => <li key={k}>→ {a.what}</li>)}
              </ul>
            </RecordCard>
          ))}
        </Section>

        <Section title="Tasks">
          {b.tasks.map((t) => <TaskCard key={t._id} task={t} now={now} />)}
        </Section>

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
