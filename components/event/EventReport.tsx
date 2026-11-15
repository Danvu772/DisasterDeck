"use client";
import Link from "next/link";
import type { Event } from "@/lib/types";
import { ageText, button, link, statusTag, statusText } from "../encode";
import { summary } from "../EventRow";
import { SOURCE_LABEL } from "../Stamp";
import { fieldRows } from "./fields";
import { openHref, recordKind } from "./recordKind";
import { LANE_TEXT, exactTime, gapText } from "./timing";

// What came in and what the desk did with it. Written against Event, so a future GET /api/events plugs in.
export function EventReport({ e, now, actorName, onBack }: { e: Event; now: number; actorName: string; onBack: () => void }) {
  const s = summary(e);
  const gap = gapText(e);
  const rows = fieldRows(e.type, e.payload);
  const kind = recordKind(e);
  const ids = e.result?.recordIds ?? [];
  const waiting = e.status === "pending" || e.status === "working";
  return (
    <article className="text-sm">
      <button type="button" onClick={onBack} className={button.outline}>Back to feed</button>

      <header className="mt-3">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold">{s.said}</h2>
          <span className={statusTag}>{statusText(e.status)}</span>
        </div>
        {s.original && <p className="text-muted">{s.original}</p>}
      </header>

      <section className="mt-4">
        <h3 className="font-bold">Who and when</h3>
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-muted">Actor</dt>
          <dd><span className="font-bold">{actorName}</span>{actorName !== e.actor && <span className="text-muted">, {e.actor}</span>}</dd>
          <dt className="text-muted">Source</dt><dd>{SOURCE_LABEL[e.source]}</dd>
          <dt className="text-muted">Lane</dt><dd>{LANE_TEXT[e.lane]}</dd>
          <dt className="text-muted">Observed</dt>
          <dd>{ageText(e.observedAt ?? e.ts, now)}, <span suppressHydrationWarning>{exactTime(e.observedAt ?? e.ts)}</span></dd>
          <dt className="text-muted">Received</dt>
          <dd>{ageText(e.ts, now)}, <span suppressHydrationWarning>{exactTime(e.ts)}</span></dd>
        </dl>
        {gap && <p className="mt-1 font-bold">{gap}</p>}
      </section>

      <section className="mt-4">
        <h3 className="font-bold">What it said</h3>
        {rows.length === 0 ? <p className="text-muted">No fields.</p> : (
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {rows.map((r) => <div key={r.key} className="contents"><dt className="text-muted">{r.label}</dt><dd className="break-words">{r.value}</dd></div>)}
          </dl>
        )}
      </section>

      <section className="mt-4">
        <h3 className="font-bold">What the desk did</h3>
        {waiting && <p className="text-muted">Waiting for the desk to pick it up.</p>}
        {e.status === "merged" && <p>Merged into an existing record.</p>}
        {e.result?.reason && (
          <p className={e.status === "failed" ? "text-act" : e.status === "rejected" ? "text-muted" : ""}>
            {e.status === "failed" ? "Failed and needs a person: " : e.status === "rejected" ? "Rejected: " : ""}{e.result.reason}
          </p>
        )}
        {e.status === "failed" && !e.result?.reason && <p className="text-act">Failed and needs a person.</p>}
        {e.dedupeKey && <p className="text-muted">Dedupe key {e.dedupeKey}</p>}
        {!!e.attempts && <p className="text-muted">Attempts: {e.attempts}</p>}
      </section>

      <section className="mt-4">
        <h3 className="font-bold">Records it touched</h3>
        {ids.length === 0 ? <p className="text-muted">None.</p> : (
          <ul className="mt-1 space-y-0.5">
            {ids.map((id) => {
              const href = openHref(kind, id);
              return <li key={id}>{href ? <Link href={href} className={link}>{id}</Link> : <span>{id}</span>}</li>;
            })}
          </ul>
        )}
      </section>
    </article>
  );
}
