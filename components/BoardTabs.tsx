"use client";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Incident, Site } from "@/lib/types";
import {
  type Board, IncidentCards, NeedCards, RoadCards, ShelterCards, SiteCards, TaskCards,
} from "./BoardCards";
import { DetailPanel } from "./detail/DetailPanel";
import { parseKey, type DetailKind } from "./detail/locate";
import { severityTier } from "./encode";
import { siteOfTask } from "./map/mapItems";

// One tab per kind of thing to act on. Sites and the problems in the field share a tab,
// so a reader sees the problem next to the place. The red count is how many act-now items
// sit behind a tab, so nothing tier 0 hides behind a tab you are not looking at.
const TABS = [
  { id: "incident_sites", label: "Incident sites" },
  { id: "needs", label: "Needs" },
  { id: "shelters", label: "Shelters" },
  { id: "roads", label: "Roads" },
  { id: "tasks", label: "Tasks" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const TAB_OF: Record<DetailKind, Tab> = {
  site: "incident_sites", incident: "incident_sites", need: "needs", shelter: "shelters", road: "roads", task: "tasks",
};

const openIncident = (i: Incident) => i.status !== "resolved";

function count(board: Board, tab: Tab): number {
  return tab === "incident_sites" ? board.sites.length + board.incidents.filter(openIncident).length : board[tab].length;
}

function actNowCount(board: Board, tab: Tab): number {
  switch (tab) {
    case "incident_sites":
      return board.sites.filter((s) => s.tier === 0 && s.status !== "closed").length
        + board.incidents.filter((i) => i.severity === "critical" && openIncident(i)).length;
    case "needs": return board.needs.filter((n) => n.tier === 0 && n.status !== "delivered").length;
    case "tasks": return board.tasks.filter((t) => t.open && t.tier === 0).length;
    default: return 0;
  }
}

type Row = { site: Site; incidents: Incident[] } | { incident: Incident };

// Sites and incidents in one list, by tier then priority. An incident whose task points at a
// site (directly, or through the need it delivers) sits under that site instead.
export function incidentSiteRows(board: Board): Row[] {
  const under = new Map<string, Incident[]>();
  const loose: Incident[] = [];
  for (const i of board.incidents) {
    const site = siteOfTask(board, i.taskId);
    if (site) under.set(site._id, [...(under.get(site._id) ?? []), i]);
    else loose.push(i);
  }
  const byTier = (i: Incident) => severityTier(i.severity);
  // Incidents have no priority score. A critical one leads its tier, the rest follow the sites.
  const rank = (r: Row) => "site" in r
    ? { tier: r.site.tier, priority: r.site.priority }
    : { tier: byTier(r.incident), priority: r.incident.severity === "critical" ? Infinity : -1 };
  const rows: Row[] = [
    ...board.sites.map((site) => ({ site, incidents: (under.get(site._id) ?? []).sort((a, b) => byTier(a) - byTier(b)) })),
    ...loose.map((incident) => ({ incident })),
  ];
  return rows.sort((a, b) => {
    const x = rank(a), y = rank(b);
    return x.tier - y.tier || (y.priority > x.priority ? 1 : y.priority < x.priority ? -1 : 0);
  });
}

// A card you can open. Buttons, links and the History toggle inside it keep their own job.
function Openable({ id, openKey, onOpen, children }: {
  id: string; openKey: string | null; onOpen: (key: string) => void; children: React.ReactNode;
}) {
  const on = openKey === id;
  return (
    <div tabIndex={0} data-card={id}
      onClick={(e) => { if (!(e.target as HTMLElement).closest("button, a, details, input")) onOpen(id); }}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpen(id); }
      }}
      className={`grid cursor-pointer rounded-card ${on ? "ring-4 ring-primary" : "hover:ring-2 hover:ring-primary"}`}>
      {children}
    </div>
  );
}

export function BoardTabs({ board, now, live = true, initial = "incident_sites" }: {
  board: Board; now: number; live?: boolean; initial?: Tab;
}) {
  // ?open=<kind>:<id> is the panel, so a link opens the same record.
  const openKey = useSearchParams().get("open");
  const [tab, setTab] = useState<Tab>(() => {
    const kind = parseKey(openKey)?.kind;
    return kind ? TAB_OF[kind] : initial;
  });

  const setOpen = useCallback((key: string | null) => {
    const url = new URL(window.location.href);
    if (key) url.searchParams.set("open", key);
    else url.searchParams.delete("open");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, []);
  const open = useCallback((key: string) => {
    const kind = parseKey(key)?.kind;
    if (kind) setTab(TAB_OF[kind]);
    setOpen(key);
  }, [setOpen]);
  const close = useCallback(() => setOpen(null), [setOpen]);

  // Keep the panel mounted for the slide out, same 200 ms as the slide in.
  const [held, setHeld] = useState(openKey);
  useEffect(() => {
    if (openKey) { setHeld(openKey); return; }
    const t = setTimeout(() => setHeld(null), 200);
    return () => clearTimeout(t);
  }, [openKey]);

  // The board column narrows while the panel is open, so after it settles bring the open card back into view.
  useEffect(() => {
    if (!openKey || !window.matchMedia("(min-width: 768px)").matches) return;
    const t = setTimeout(() => {
      document.querySelector(`[data-card="${CSS.escape(openKey)}"]`)?.scrollIntoView({ block: "nearest" });
    }, 220);
    return () => clearTimeout(t);
  }, [openKey]);

  const card = (id: string, node: React.ReactNode) => (
    <Openable key={id} id={id} openKey={openKey} onOpen={open}>{node}</Openable>
  );

  return (
    <div>
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => {
          const act = actNowCount(board, t.id);
          const on = t.id === tab;
          return (
            <button key={t.id} role="tab" aria-selected={on} onClick={() => setTab(t.id)}
              className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
                on ? "border-primary font-bold text-ink" : "border-transparent text-muted hover:text-primary"}`}>
              {t.label}
              <span className="text-muted">({count(board, t.id)})</span>
              {act > 0 && <span className="rounded-tag bg-act px-1.5 text-xs font-bold text-card">{act}</span>}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" className={`mt-4 grid gap-3 ${
        openKey ? "md:grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3" : "md:grid-cols-2 lg:grid-cols-3"}`}>
        {tab === "incident_sites" && incidentSiteRows(board).map((r) => "site" in r ? (
          <div key={`site:${r.site._id}`} className="flex flex-col gap-2">
            {card(`site:${r.site._id}`, <SiteCards items={[r.site]} now={now} tasks={board.tasks} />)}
            {r.incidents.map((i) => (
              <div key={i._id} className="ml-6">
                {card(`incident:${i._id}`, <IncidentCards items={[i]} now={now} />)}
              </div>
            ))}
          </div>
        ) : card(`incident:${r.incident._id}`, <IncidentCards items={[r.incident]} now={now} />))}
        {tab === "needs" && board.needs.map((n) => card(`need:${n._id}`, <NeedCards items={[n]} now={now} />))}
        {tab === "shelters" && board.shelters.map((s) => card(`shelter:${s._id}`, <ShelterCards items={[s]} now={now} />))}
        {tab === "roads" && board.roads.map((r) => card(`road:${r._id}`, <RoadCards items={[r]} now={now} />))}
        {tab === "tasks" && board.tasks.map((t) => card(`task:${t._id}`, <TaskCards items={[t]} now={now} />))}
      </div>
      {held && <DetailPanel board={board} now={now} live={live} openKey={held} closing={!openKey} onOpen={open} onClose={close} />}
    </div>
  );
}
