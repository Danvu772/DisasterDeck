"use client";
import { useState } from "react";
import {
  type Board, IncidentCards, NeedCards, RoadCards, ShelterCards, SiteCards, TaskCards,
} from "./BoardCards";

// One tab per record type. The red count is how many act-now items sit behind a tab,
// so nothing tier 0 hides behind a tab you are not looking at.
const TABS = ["sites", "needs", "shelters", "roads", "incidents", "tasks"] as const;
type Tab = (typeof TABS)[number];

function actNowCount(board: Board, tab: Tab): number {
  switch (tab) {
    case "sites": return board.sites.filter((s) => s.tier === 0 && s.status !== "closed").length;
    case "needs": return board.needs.filter((n) => n.tier === 0 && n.status !== "delivered").length;
    case "incidents": return board.incidents.filter((i) => i.severity === "critical" && i.status !== "resolved").length;
    case "tasks": return board.tasks.filter((t) => t.open && t.tier === 0).length;
    default: return 0;
  }
}

export function BoardTabs({ board, now, initial = "sites" }: { board: Board; now: number; initial?: Tab }) {
  const [tab, setTab] = useState<Tab>(initial);
  return (
    <div>
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => {
          const act = actNowCount(board, t);
          const on = t === tab;
          return (
            <button key={t} role="tab" aria-selected={on} onClick={() => setTab(t)}
              className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm capitalize ${
                on ? "border-ink font-medium" : "border-transparent text-muted hover:text-ink"}`}>
              {t}
              <span className="font-mono text-xs text-muted">{board[t].length}</span>
              {act > 0 && <span className="rounded bg-act px-1 font-mono text-xs text-card">{act}</span>}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {tab === "sites" && <SiteCards items={board.sites} now={now} />}
        {tab === "needs" && <NeedCards items={board.needs} now={now} />}
        {tab === "shelters" && <ShelterCards items={board.shelters} now={now} />}
        {tab === "roads" && <RoadCards items={board.roads} now={now} />}
        {tab === "incidents" && <IncidentCards items={board.incidents} now={now} />}
        {tab === "tasks" && <TaskCards items={board.tasks} now={now} />}
      </div>
    </div>
  );
}
