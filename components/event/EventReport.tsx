"use client";
import { ArrowLeft, ArrowUpRight, Clock, LoaderCircle } from "lucide-react";
import Link from "next/link";
import type { Event } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { actorLabel, KIND_WORD } from "../detail/fields";
import { ageText } from "../encode";
import { EVENT_ICON, outcome, summary } from "../EventRow";
import { SOURCE_LABEL } from "../Stamp";
import { fieldRows, photoUrlOf } from "./fields";
import { openHref, recordKind } from "./recordKind";
import { gapText } from "./timing";

// What came in and what the desk did with it. Written against Event, so a future GET /api/events plugs in.
export function EventReport({ e, now, actorName, onBack, demo }: { e: Event & { _id?: string }; now: number; actorName: string; onBack: () => void; demo?: boolean }) {
  const s = summary(e);
  const gap = gapText(e);
  const rows = fieldRows(e.type, e.payload);
  const photo = photoUrlOf(e.type, e.payload);
  const kind = recordKind(e);
  const ids = e.result?.recordIds ?? [];
  const waiting = !demo && (e.status === "pending" || e.status === "working");
  const failed = e.status === "failed";
  const Icon = EVENT_ICON[e.type];
  const source = e.source === "person" || e.source === "system" ? null : SOURCE_LABEL[e.source];
  return (
    <article className="text-sm">
      <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 text-muted-foreground">
        <ArrowLeft aria-hidden />Back to feed
      </Button>

      <header className="mt-3 flex items-start gap-3">
        <span aria-hidden className={`grid size-9 shrink-0 place-items-center rounded-lg ${
          e.type === "incident" || failed ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground"}`}>
          {Icon && <Icon className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold leading-snug">{s.said}</h2>
          {s.original && <p className="mt-1 text-muted-foreground">{s.original}</p>}
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{actorLabel(actorName)}</span>
            {source && <><span aria-hidden>·</span><span>{source}</span></>}
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1" suppressHydrationWarning><Clock className="size-3" aria-hidden />{ageText(e.observedAt ?? e.ts, now)}</span>
            {demo && <span className="rounded-full border px-2">Demo</span>}
          </p>
          {gap && <p className="mt-1 text-xs text-muted-foreground">{gap}</p>}
        </div>
      </header>

      {rows.length > 0 && (
        <dl className="mt-4 grid grid-cols-2 gap-2">
          {rows.map((r) => (
            <div key={r.key} className="rounded-lg bg-secondary px-3 py-2">
              <dt className="text-xs text-muted-foreground">{r.label}</dt>
              <dd className="break-words font-medium">{r.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {photo && (
        <figure className="mt-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- the photo is a data URL from the person; no optimization, no external src */}
          <img src={photo} alt="Photo the person attached to this report" className="max-h-80 w-auto rounded-lg border" />
          <figcaption className="mt-1 text-xs text-muted-foreground">Attached photo, kept for a coordinator to review.</figcaption>
        </figure>
      )}

      <section className="mt-5">
        <h3 className="text-sm font-semibold">What the desk did</h3>
        <div className={`mt-2 rounded-lg border p-3 ${failed ? "border-destructive/30 bg-destructive/5" : ""}`}>
          <p className={`flex items-center gap-1.5 font-medium ${failed ? "text-destructive" : ""}`}>
            {waiting && <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />}
            {demo ? "Demo, nothing reached the desk" : outcome(e)}
          </p>
          {e.result?.reason && <p className="mt-1 text-muted-foreground">{e.result.reason}</p>}
        </div>
      </section>

      {ids.length > 0 && kind && kind !== "zone" && (
        <div className="mt-4 flex flex-wrap gap-2">
          {ids.map((id, i) => {
            const href = openHref(kind, id);
            const label = `Open ${KIND_WORD[kind].toLowerCase()}${ids.length > 1 ? ` ${i + 1}` : ""}`;
            return href && (
              <Button key={id} asChild variant="outline" size="sm">
                <Link href={href}>{label}<ArrowUpRight aria-hidden /></Link>
              </Button>
            );
          })}
        </div>
      )}
    </article>
  );
}
