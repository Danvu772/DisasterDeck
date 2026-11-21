"use client";
// The board list: filter chips over one list. Each row says what, how bad, the one line that matters, and how long ago.
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import type { Incident, Need, Road, Shelter, Site, Task } from "@/lib/types";
import { users } from "@/fixtures/desk";
import type { Board } from "../BoardCards";
import { KindIcon, TierBadge } from "../RecordCard";
import { Stamp } from "../Stamp";
import { ageText, chip } from "../encode";
import { LOOP_LABELS, loopStep } from "../loopStep";
import { CALL_WORD, plural, statusWord, taskTitle } from "../detail/fields";
import { CaseNo } from "../ScoreBreakdown";
import { summary } from "../detail/locate";
import { counts, FILTERS, type Filter, listRows, type Row } from "./rows";

export function FilterChips({ board, filter, onFilter }: {
  board: Board; filter: Filter; onFilter: (f: Filter) => void;
}) {
  return (
    <div role="group" aria-label="Filter the list" className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
      {FILTERS.map((f) => {
        const c = counts(board, f.id);
        const on = filter === f.id;
        return (
          <button key={f.id} type="button" aria-pressed={on} onClick={() => onFilter(f.id)} className={`${chip(on)} shrink-0`}>
            {f.label}
            <span className={`font-mono ${on ? "opacity-70" : "text-muted-foreground"}`}>{c.total}</span>
            {c.act > 0 && (
              <span title={`${c.act} life-threatening`} className="grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 font-mono text-[10px] text-destructive-foreground">{c.act}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const nameOf = (id: string) => users.find((u) => u._id === id)?.name;

// The one line under the title.
function lineOf(r: Row, board: Board, now: number): React.ReactNode {
  switch (r.kind) {
    case "site": {
      const s = r.record as Site;
      const step = loopStep(s, board.tasks);
      const trapped = s.peopleTrapped > 0 ? `${plural(s.peopleTrapped, "person", "people")} trapped` : "Nobody reported trapped";
      return `${trapped} · ${step > 1 ? cap(LOOP_LABELS[step - 1]) : CALL_WORD[s.callStatus] ?? "Reported"}`;
    }
    case "incident": return (r.record as Incident).textEn;
    case "need": {
      const n = r.record as Need;
      if (n.status === "proposed") return `${n.support} of 3 requests so far`;
      const site = n.siteIds.map((id) => board.sites.find((s) => s._id === id)).find(Boolean);
      return site ? `For ${site.address}` : plural(n.support, "request", "requests");
    }
    case "shelter": {
      const h = r.record as Shelter;
      const pct = Math.min(100, Math.round((100 * h.bedsUsed) / Math.max(1, h.bedsTotal)));
      return (
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-20 overflow-hidden rounded-full bg-secondary">
            <span className={`block h-full rounded-full ${pct > 90 ? "bg-warning" : "bg-foreground/60"}`} style={{ width: `${pct}%` }} />
          </span>
          <span className="font-mono">{h.bedsUsed}/{h.bedsTotal}</span> beds
        </span>
      );
    }
    case "road": return (r.record as Road).reason;
    case "task": {
      const t = r.record as Task;
      const who = t.assignee ? nameOf(t.assignee) ?? "Assigned" : "Unassigned";
      return `${who} · waiting ${ageText(t.history[0]?.ts ?? t.deadline, now).replace(" ago", "")}`;
    }
  }
}

// When the record was true.
function when(r: Row, now: number): React.ReactNode {
  switch (r.kind) {
    case "site": return <Stamp type="site" at={(r.record as Site).observedAt} now={now} />;
    case "need": return <Stamp type="need" at={(r.record as Need).history[0]?.ts ?? new Date(now)} now={now} />;
    case "shelter": return <Stamp type="shelter" at={(r.record as Shelter).observedAt} now={now} />;
    case "road": return <Stamp type="road" at={(r.record as Road).observedAt} now={now} />;
    case "incident": return <Stamp type="incident" at={(r.record as Incident).actions[0]?.ts ?? new Date(now)} now={now} />;
    case "task": { const t = r.record as Task; return <Stamp type={t.recordType} at={t.history[0]?.ts ?? new Date(now)} now={now} />; }
  }
}

function ListRow({ r, board, now, selected, onOpen }: {
  r: Row; board: Board; now: number; selected: boolean; onOpen: (key: string) => void;
}) {
  const s = summary(r.kind, r.record, now);
  const overdue = r.kind === "task" && s.actNow;
  const finished = r.kind === "task" && !(r.record as Task).open;
  // A site's stage is already in its line, so its badge only shows when it left the board's normal flow.
  const status = r.kind === "shelter" || (r.kind === "site" && s.status !== "retracted") ? null : statusWord(s.status);
  return (
    <motion.li layout="position" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 380, damping: 36 }} className={cn(r.indent ? "relative pl-6" : "", finished && "opacity-60")}>
      {r.indent && <span aria-hidden className="absolute bottom-3 left-[25px] top-0 w-px bg-border" />}
      <button type="button" data-card={r.key} aria-pressed={selected} onClick={() => onOpen(r.key)}
        className={`flex w-full gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors ${
          selected ? "bg-secondary ring-1 ring-border" : "hover:bg-secondary/60"}`}>
        <KindIcon type={r.kind} record={r.record} tier={s.tier} actNow={s.actNow} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-baseline gap-2">
            <span className="truncate text-sm font-semibold">
              {s.caseNo !== undefined && <span className="mr-1.5 font-normal text-muted-foreground"><CaseNo kind={r.kind} no={s.caseNo} /></span>}
              <span className="first-letter:uppercase">{taskTitle(s.title)}</span>
            </span>
            <span className="ml-auto shrink-0">{when(r, now)}</span>
          </span>
          <span className="line-clamp-1 text-xs text-muted-foreground" suppressHydrationWarning>{lineOf(r, board, now)}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            {!finished && (r.indent ? s.actNow : s.tier < 2 || s.actNow) && <TierBadge tier={s.tier} actNow={s.actNow} />}
            {status && <span className="inline-flex h-5 items-center rounded-full border px-2 text-xs text-muted-foreground">{status}</span>}
            {overdue && <span className="text-xs font-medium text-destructive">Overdue</span>}
          </span>
        </span>
      </button>
    </motion.li>
  );
}

export function BoardList({ board, now, filter, selected, onOpen }: {
  board: Board; now: number; filter: Filter; selected: string | null; onOpen: (key: string) => void;
}) {
  const rows = listRows(board, filter, now);
  if (rows.length === 0) return <p className="px-4 py-10 text-center text-sm text-muted-foreground">Nothing here right now.</p>;
  return (
    <ul aria-label="Shared priority list" className="flex flex-col gap-0.5 p-2">
      <AnimatePresence initial={false}>
        {rows.map((r) => <ListRow key={r.key} r={r} board={board} now={now} selected={r.key === selected} onOpen={onOpen} />)}
      </AnimatePresence>
    </ul>
  );
}
