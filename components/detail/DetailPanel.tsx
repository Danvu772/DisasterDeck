"use client";
// Everything the desk knows about one record, pinned on a map. Opens from any board card,
// and from a link with ?open=<kind>:<id>. Reads only the board the page already polls.
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Incident, Site } from "@/lib/types";
import type { Board } from "../BoardCards";
import { History } from "../History";
import { SOURCE_LABEL } from "../Stamp";
import { button, link, statusTag, statusText, tierBar } from "../encode";
import { fromBoard } from "../map/mapItems";
import { fields, TIER_WORD, when } from "./fields";
import { type DetailKind, findRecord, links, locate, parseKey, summary } from "./locate";

const DetailMap = dynamic(() => import("./DetailMap"), {
  ssr: false,
  loading: () => <p className="p-4 text-sm text-muted">Loading the map</p>,
});

const KIND_WORD: Record<DetailKind, string> = {
  site: "Site", need: "Need", shelter: "Shelter", road: "Road", incident: "Problem in the field", task: "Task",
};

// Full height under the nav at md and up. The nav is not a fixed height (the account
// button wraps), so measure where it ends.
function useNavBottom() {
  const [px, setPx] = useState(0);
  useLayoutEffect(() => {
    const nav = document.querySelector("nav");
    if (!nav) return;
    const measure = () => setPx(nav.getBoundingClientRect().bottom);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(nav);
    return () => ro.disconnect();
  }, []);
  return px;
}

export function DetailPanel({ board, now, live, openKey, onOpen, onClose }: {
  board: Board; now: number; live: boolean; openKey: string;
  onOpen: (key: string) => void; onClose: () => void;
}) {
  const top = useNavBottom();
  const box = useRef<HTMLDivElement>(null);
  const ref = parseKey(openKey);
  const record = ref ? findRecord(board, ref.kind, ref.id) : undefined;
  const mapItems = useMemo(() => fromBoard(board, { showClosed: true }), [board]);

  // Escape closes. Focus moves into the panel, and back to the card when it closes.
  // The board re-renders every second, so read onClose through a ref and bind once.
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close.current(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); back?.focus(); };
  }, []);
  useEffect(() => { box.current?.focus(); }, [openKey]);

  const shell = (title: string, body: React.ReactNode) => (
    <div ref={box} tabIndex={-1} role="dialog" aria-label={title}
      style={{ "--nav-bottom": `${top}px` } as React.CSSProperties}
      className="fixed inset-0 z-[1100] flex flex-col bg-card md:left-auto md:top-(--nav-bottom) md:w-[45%] md:border-l md:border-line">
      <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-2">
        <p className="text-sm text-muted">{ref ? KIND_WORD[ref.kind] : "Record"}</p>
        {!live && <p className="text-sm text-muted">Demo data, the board API is not answering.</p>}
        <button type="button" onClick={onClose} className={`${button.outline} ml-auto`}>Close</button>
      </div>
      {body}
    </div>
  );

  if (!ref || !record) {
    return shell("Not found", (
      <p className="p-4">Nothing on the board has the id {ref?.id ?? openKey}. It may have been merged or retracted.</p>
    ));
  }

  const { kind } = ref;
  const head = summary(kind, record, now);
  const loc = locate(kind, record, board);
  const rows = fields(kind, record, now);
  const linked = links(kind, record, board);
  const site = kind === "site" ? (record as Site) : undefined;
  const incident = kind === "incident" ? (record as Incident) : undefined;
  const history = (record as { history?: Site["history"] }).history ?? [];

  return shell(head.title, (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {loc ? (
        <>
          <div className="h-[40vh] shrink-0 border-b border-line">
            <DetailMap items={mapItems} selected={loc.key} center={loc.coords} now={now} onPick={onOpen} />
          </div>
          <div className="px-4 pt-2 text-sm">
            {loc.via && (
              <p className="text-muted">
                {kind === "incident"
                  ? `Shown at ${loc.via.label}, no position of its own.`
                  : `Shown at ${loc.via.label}, the ${loc.via.kind} this ${kind} is for.`}
              </p>
            )}
            <Link href={`/map?focus=${encodeURIComponent(loc.key)}`} className={link}>Open on the full map</Link>
          </div>
        </>
      ) : (
        <p className="m-4 rounded-card border border-dashed border-muted p-4 text-muted">No location yet</p>
      )}

      <section className="p-4">
        <h2 className="text-xl font-bold first-letter:uppercase">{head.title}</h2>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
          <span className={`inline-block h-3.5 w-3.5 rounded-tag ${tierBar(head.tier, head.actNow)}`} aria-hidden />
          <span className="font-bold">{TIER_WORD[head.tier]}</span>
          {head.priority !== undefined && <span>Priority {head.priority}</span>}
          <span className={statusTag}>{statusText(head.status)}</span>
          <span className="capitalize text-muted">{head.confidence}</span>
        </p>

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
                <li key={i}>{SOURCE_LABEL[s.source] ?? s.source}, <span className="text-muted">event {s.eventId}</span></li>
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
    </div>
  ));
}
