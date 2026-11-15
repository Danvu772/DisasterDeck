"use client";
// The board list: v1's tabs as filter chips over one list, in v2's row style with v1's row content.
import type { Incident, Need, Road, Shelter, Site, Task } from "@/lib/types";
import { users } from "@/fixtures/desk";
import type { Board } from "../BoardCards";
import { Stamp } from "../Stamp";
import { CaseNo, ScoreBreakdown } from "../ScoreBreakdown";
import { chip, minutesSince, statusTag, statusText, tierBadge, tierText } from "../encode";
import { loopLine } from "../loopStep";
import { KIND_WORD } from "../detail/DetailPanel";
import { summary } from "../detail/locate";
import { counts, FILTERS, type Filter, listRows, type Row } from "./rows";

export function FilterChips({ board, filter, onFilter }: {
  board: Board; filter: Filter; onFilter: (f: Filter) => void;
}) {
  return (
    <div role="group" aria-label="Filter the list" className="flex flex-wrap gap-1.5">
      {FILTERS.map((f) => {
        const c = counts(board, f.id);
        return (
          <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => onFilter(f.id)} className={chip(filter === f.id)}>
            {f.label}
            <span className="font-mono font-normal">{c.total}</span>
            {c.act > 0 && <span className="rounded-pill bg-act px-1.5 font-mono text-xs text-card">{c.act}</span>}
          </button>
        );
      })}
    </div>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// The lines under the title, the same ones the v1 cards carried.
function RowLines({ r, board, now }: { r: Row; board: Board; now: number }) {
  const line = "text-xs text-muted";
  switch (r.kind) {
    case "site": {
      const s = r.record as Site;
      const posts = s.sources.length;
      return (
        <>
          <span className="text-sm">{plural(s.peopleTrapped, "person", "people")} trapped. Call status: {statusText(s.callStatus)}.</span>
          <span className={line}>{loopLine(s, board.tasks)}</span>
          {!(posts === 1 && s.support === 1) && <span className={line}>{plural(posts, "post", "posts")} from {plural(s.support, "person", "people")}</span>}
          {!s.history.some((h) => h.source === "person") && <span className={line}>Automated, not yet seen by a person.</span>}
        </>
      );
    }
    case "incident": {
      const i = r.record as Incident;
      return <><span className="text-sm">{i.textEn}</span><span className={line}>{i.text}</span></>;
    }
    case "need": {
      const n = r.record as Need;
      return (
        <>
          <span className="text-sm">{n.region}</span>
          {n.status === "proposed" && <span className={line}>{n.support} of 3 requests needed</span>}
        </>
      );
    }
    case "shelter": {
      const h = r.record as Shelter;
      return (
        <span className="mt-1 block h-1.5 w-full rounded-pill bg-line">
          <span className="block h-1.5 rounded-pill bg-ink" style={{ width: `${Math.min(100, (100 * h.bedsUsed) / h.bedsTotal)}%` }} />
        </span>
      );
    }
    case "road": return <span className="text-sm">{(r.record as Road).reason}</span>;
    case "task": {
      const t = r.record as Task;
      const overdue = t.open && new Date(t.deadline).getTime() < now;
      return (
        <>
          {t.detail && <span className="text-sm">{t.detail}</span>}
          <span className={line}>
            {t.assignee ? `Owner: ${users.find((u) => u._id === t.assignee)?.name ?? t.assignee}` : "Unassigned"}, waiting {minutesSince(t.history[0]?.ts ?? t.deadline, now)} min
            {overdue && <span className="ml-1 font-bold text-act">Overdue</span>}
          </span>
        </>
      );
    }
  }
}

// When the record was true, the same field the v1 card stamped.
function stamp(r: Row, now: number): React.ReactNode {
  switch (r.kind) {
    case "site": { const s = r.record as Site; return <Stamp type="site" at={s.observedAt} source={s.sources[0]?.source} sources={s.sources.length} now={now} />; }
    case "need": { const n = r.record as Need; return <Stamp type="need" at={n.history[0]?.ts ?? new Date(now)} now={now} />; }
    case "shelter": { const h = r.record as Shelter; return <Stamp type="shelter" at={h.observedAt} source="instagram" now={now} />; }
    case "road": { const d = r.record as Road; return <Stamp type="road" at={d.observedAt} source="person" now={now} />; }
    case "incident": { const i = r.record as Incident; return <Stamp type="incident" at={i.actions[0]?.ts ?? new Date(now)} source="person" now={now} />; }
    case "task": { const t = r.record as Task; return <Stamp type={t.recordType} at={t.history[0]?.ts ?? new Date(now)} source="system" now={now} />; }
  }
}

function ListRow({ r, board, now, selected, onOpen }: {
  r: Row; board: Board; now: number; selected: boolean; onOpen: (key: string) => void;
}) {
  const s = summary(r.kind, r.record, now);
  const t = tierText(s.tier);
  return (
    <li className="relative border-b border-line">
      <button type="button" data-card={r.key} aria-pressed={selected} onClick={() => onOpen(r.key)}
        className={`grid w-full grid-cols-[2.5rem_minmax(0,1fr)_auto] items-start gap-3 py-2.5 pr-3 text-left ${r.indent ? "pl-9" : "pl-3"} ${
          selected ? "bg-primary-lighter shadow-[inset_0_0_0_2px_var(--color-primary)]" : "hover:bg-paper"}`}>
        <span title={t.word} className={`rounded-tag py-0.5 text-center font-mono text-xs font-bold ${tierBadge(s.tier, s.actNow)}`}>{t.code}</span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs text-muted">
            {s.caseNo !== undefined && <><CaseNo kind={r.kind} no={s.caseNo} />, </>}
            {KIND_WORD[r.kind]} <span className="font-mono">{r.record._id}</span>, {t.word}
          </span>
          <span className="font-bold first-letter:uppercase">{s.title}</span>
          <RowLines r={r} board={board} now={now} />
          <span className="mt-0.5 flex flex-wrap items-center gap-2">
            <span className={statusTag}>{statusText(s.status)}</span>
            {stamp(r, now)}
            <span className="text-xs capitalize text-muted">{s.confidence}</span>
          </span>
        </span>
        <span className="flex flex-col items-end" aria-hidden={s.scoreParts ? true : undefined}>
          {s.priority !== undefined && <>
            <span className={`font-mono text-sm font-bold ${s.scoreParts ? "invisible" : ""}`}>{s.priority}</span>
            <span className={`text-xs ${s.scoreParts ? "invisible" : "text-muted"}`}>priority</span>
          </>}
        </span>
      </button>
      {/* A button cannot sit inside the row button, so the popover trigger floats over the number's slot. */}
      {s.priority !== undefined && s.scoreParts && (
        <ScoreBreakdown stacked priority={s.priority} parts={s.scoreParts} className="absolute right-3 top-2.5" />
      )}
    </li>
  );
}

export function BoardList({ board, now, filter, selected, onOpen }: {
  board: Board; now: number; filter: Filter; selected: string | null; onOpen: (key: string) => void;
}) {
  const rows = listRows(board, filter, now);
  if (rows.length === 0) return <p className="p-3 text-sm text-muted">Nothing here right now.</p>;
  return (
    <ul aria-label="Shared priority list">
      {rows.map((r) => <ListRow key={r.key} r={r} board={board} now={now} selected={r.key === selected} onOpen={onOpen} />)}
    </ul>
  );
}
