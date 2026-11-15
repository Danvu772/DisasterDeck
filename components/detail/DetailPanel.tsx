"use client";
// Everything the desk knows about one record. The board's right column at md and up, a
// full-screen sheet on a phone. Opens from a list row, a map marker, a feed entry, or a link
// with ?open=<kind>:<id>. Reads only the board the page already polls.
// The board's big map pins the selection, so this panel has no map of its own.
import Link from "next/link";
import type { Incident, Site } from "@/lib/types";
import type { Board } from "../BoardCards";
import { History } from "../History";
import { SOURCE_LABEL } from "../Stamp";
import { CaseNo, ScoreBreakdown } from "../ScoreBreakdown";
import { button, link, statusTag, statusText, tierBadge, tierText } from "../encode";
import { fields, when } from "./fields";
import { type DetailKind, findRecord, links, locate, parseKey, summary } from "./locate";

export const KIND_WORD: Record<DetailKind, string> = {
  site: "Site", need: "Need", shelter: "Shelter", road: "Road", incident: "Problem in the field", task: "Task",
};

export function DetailPanel({ board, now, live, openKey, onOpen, onClose }: {
  board: Board; now: number; live: boolean; openKey: string;
  onOpen: (key: string) => void;
  onClose: () => void;     // the phone sheet's Close. The column at md and up has no close, it always shows a record
}) {
  const ref = parseKey(openKey);
  const record = ref ? findRecord(board, ref.kind, ref.id) : undefined;

  const shell = (body: React.ReactNode) => (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* The phone sheet covers the list, so it repeats the demo line. At md and up the list column shows it. */}
      <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-2 md:hidden">
        <p className="text-sm text-muted">{ref ? KIND_WORD[ref.kind] : "Record"}</p>
        {!live && <p className="text-sm text-muted">Demo data, the board API is not answering.</p>}
        <button type="button" onClick={onClose} className={`${button.outline} ml-auto`}>Close</button>
      </div>
      {body}
    </div>
  );

  if (!ref || !record) {
    return shell(
      <p className="p-4">Nothing on the board has the id <span className="font-mono">{ref?.id ?? openKey}</span>. It may have been merged or retracted.</p>,
    );
  }

  const { kind } = ref;
  const head = summary(kind, record, now);
  const loc = locate(kind, record, board);
  const rows = fields(kind, record, now);
  const linked = links(kind, record, board);
  const site = kind === "site" ? (record as Site) : undefined;
  const incident = kind === "incident" ? (record as Incident) : undefined;
  const history = (record as { history?: Site["history"] }).history ?? [];

  const t = tierText(head.tier);

  return shell(
    <div className="min-h-0 flex-1 overflow-y-auto">
      <section className="p-4">
        <p className="flex flex-wrap items-center gap-2">
          <span className={`rounded-tag px-1.5 py-0.5 text-xs font-bold ${tierBadge(head.tier, head.actNow)}`}>
            <span className="font-mono">{t.code}</span> {t.word}
          </span>
          <span className="text-xs text-muted">{KIND_WORD[kind]} <span className="font-mono">{record._id}</span></span>
        </p>
        <h2 className="mt-1.5 text-xl font-bold">
          {head.caseNo !== undefined && <span className="mr-2 text-base font-normal text-muted"><CaseNo kind={kind} no={head.caseNo} /></span>}
          <span className="first-letter:uppercase">{head.title}</span>
        </h2>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
          {head.priority !== undefined && <ScoreBreakdown priority={head.priority} parts={head.scoreParts} className="text-sm" />}
          <span className={statusTag}>{statusText(head.status)}</span>
          <span className="capitalize text-muted">{head.confidence}</span>
        </p>

        {loc ? (
          <div className="mt-2 text-sm">
            {loc.via && (
              <p className="text-muted">
                {kind === "incident"
                  ? `Shown at ${loc.via.label}, no position of its own.`
                  : `Shown at ${loc.via.label}, the ${loc.via.kind} this ${kind} is for.`}
              </p>
            )}
            <Link href={`/map?focus=${encodeURIComponent(loc.key)}`} className={link}>Open on the full map</Link>
          </div>
        ) : (
          <p className="mt-2 rounded-card border border-dashed border-muted p-3 text-sm text-muted">No location yet</p>
        )}

        <dl className="mt-4 grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-4 gap-y-1 text-sm">
          {rows.map((f) => (
            <div key={f.key} className="contents">
              <dt className="text-muted">{f.label}</dt>
              <dd className={`break-words ${f.muted ? "text-muted" : ""}`}>{f.value}</dd>
            </div>
          ))}
        </dl>

        {site && site.sources.length > 0 && (
          <>
            <h3 className="mt-5 font-bold">Sources ({site.sources.length})</h3>
            <ul className="mt-1 space-y-0.5 text-sm">
              {site.sources.map((s, i) => (
                <li key={i}>{SOURCE_LABEL[s.source] ?? s.source}, <span className="text-muted">event <span className="font-mono">{s.eventId}</span></span></li>
              ))}
            </ul>
          </>
        )}

        {linked.length > 0 && (
          <>
            <h3 className="mt-5 font-bold">Linked records</h3>
            <ul className="mt-1 space-y-1 text-sm">
              {linked.map((l) => (
                <li key={`${l.why}:${l.key}`}>
                  {l.why}:{" "}
                  {l.record ? (
                    <>
                      <button type="button" onClick={() => onOpen(l.key)} className={`${link} text-left first-letter:uppercase`}>
                        {summary(l.kind, l.record, now).title}
                      </button>
                      <span className="text-muted">, {statusText(summary(l.kind, l.record, now).status)}</span>
                    </>
                  ) : (
                    <span className="text-muted">{l.key.split(":")[1]}, not on the board</span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        {incident && incident.actions.length > 0 && (
          <>
            <h3 className="mt-5 font-bold">Actions taken</h3>
            <ul className="mt-1 space-y-0.5 text-sm">
              {incident.actions.map((a, i) => (
                <li key={i}><span className="text-muted">{when(a.ts, now)}:</span> {a.what}</li>
              ))}
            </ul>
          </>
        )}

        {history.length > 0 && <History entries={history} now={now} />}
      </section>
    </div>,
  );
}
