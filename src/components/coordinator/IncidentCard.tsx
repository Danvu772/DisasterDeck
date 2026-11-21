import type { Incident } from "@/lib/types";
import { cn } from "@/lib/utils";
import { severityTier } from "../encode";
import { INCIDENT_WORD } from "../detail/locate";
import { plainStep, statusWord } from "../detail/fields";
import { card, KindGlyph, TierTag } from "./parts";

// A field problem: what happened (what the person said) and what the desk already did about it
// (the Brain's playbook actions, §5.4). Severity maps to the same tier colours as everything else.
export function IncidentCard({ incident, now, nameOf }: {
  incident: Incident; now: number; nameOf: (id: string) => string;
}) {
  const tier = severityTier(incident.severity);
  const actNow = incident.severity === "critical";
  return (
    <article className={cn(card, "p-4", actNow && "border-usa-error")}>
      <header className="flex items-start gap-3">
        <KindGlyph kind="incident" tier={tier} actNow={actNow} />
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold leading-snug text-usa-ink">
            {INCIDENT_WORD[incident.kind] ?? incident.kind.replaceAll("_", " ")}
          </h3>
          <p className="mt-0.5 text-xs text-usa-base-dark" suppressHydrationWarning>
            Reported by {nameOf(incident.reportedBy)} · <IncidentAge at={incident.actions[0]?.ts ?? incident.history[0]?.ts} now={now} />
          </p>
        </div>
        <TierTag tier={tier} actNow={actNow} />
      </header>

      {/* What happened, in the person's own (translated) words. */}
      <p className="mt-3 text-sm text-usa-ink">{incident.textEn}</p>

      {/* What the desk already did about it. */}
      {incident.actions.length > 0 && (
        <div className="mt-3 border-t border-usa-base-lighter pt-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-usa-base-dark">The desk already did</p>
          <ul className="mt-1 space-y-1">
            {incident.actions.map((a, k) => (
              <li key={k} className="flex gap-2 text-sm text-usa-ink">
                <span aria-hidden className="text-usa-base">→</span>
                <span>{plainStep(a.what, nameOf)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <footer className="mt-3 flex items-center gap-2">
        <span className="usa-tag bg-usa-base-lightest text-usa-ink">{statusWord(incident.status)}</span>
      </footer>
    </article>
  );
}

// "just now", "4 min ago". `now` is the poll's clock, so ages stay live.
function IncidentAge({ at, now }: { at: Date | string | undefined; now: number }) {
  if (!at) return <>just now</>;
  const m = Math.max(0, Math.round((now - new Date(at).getTime()) / 60000));
  if (m < 1) return <>just now</>;
  if (m < 60) return <><span className="font-mono">{m}</span> min ago</>;
  const h = Math.floor(m / 60);
  return <><span className="font-mono">{h}</span> h ago</>;
}