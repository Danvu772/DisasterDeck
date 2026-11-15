"use client";
// /map: every place the desk knows about, on the MapLibre map, with a short list beside it.
// "Imagery" switches to the NASA / Maxar before-after view (DeskMap, Leaflet, Role 4's atlas).
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "motion/react";
import { Satellite, Map as MapIcon, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Incident, Site, Shelter, Road } from "@/lib/types";
import { KCone, KDanger, KRoadblock, KTent } from "../icons/koboyo";
import { hazardType, INCIDENT_ICON } from "../icons/things";
import { cn } from "@/lib/utils";
import { ageText, isStale } from "../encode";
import { fromBoard, type MapItem, type MapSource } from "./mapItems";
import type { Names, WorkState } from "./siteWork";
import { usePolled } from "./usePolled";
import { DeskMap } from "./DeskMap";
import type { GlQuake } from "./gl/DeskGlMap";

const DeskGlMap = dynamic(() => import("./gl/DeskGlMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-secondary" />,
});

type Filter = "all" | "life" | "hazard" | "shelter" | "road";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "life", label: "Life-threatening" },
  { id: "hazard", label: "Hazards" },
  { id: "shelter", label: "Shelters" },
  { id: "road", label: "Roads" },
];

function pass(f: Filter, it: MapItem) {
  if (f === "all") return true;
  if (f === "life") return it.actNow || (it.tier === 0 && it.kind !== "shelter" && it.kind !== "road");
  if (f === "hazard") return it.kind === "site" && !!(it.record as Site).hazard;
  return it.kind === f;
}

function KindIcon({ it }: { it: MapItem }) {
  const tone = it.kind === "shelter" ? (it.tier === 1 ? "bg-warning text-warning-foreground" : "bg-success text-primary-foreground")
    : it.kind === "road" ? "bg-secondary text-foreground"
    : it.actNow || it.tier === 0 ? "bg-destructive text-destructive-foreground"
    : it.tier === 1 ? "bg-warning text-warning-foreground" : "bg-calm text-primary-foreground";
  const hz = it.kind === "site" ? hazardType((it.record as Site).hazard) : null;
  const Icon = it.kind === "shelter" ? KTent
    : it.kind === "road" ? ((it.record as Road).state === "closed" ? KRoadblock : KCone)
    : it.kind === "incident" ? (INCIDENT_ICON[(it.record as Incident).kind] ?? KDanger)
    : hz ? hz.icon : Users;
  return (
    <span className={cn("flex size-8 shrink-0 items-center justify-center", it.kind === "incident" || it.kind === "shelter" ? "rounded-lg" : "rounded-full", tone)}>
      <Icon className="size-4" />
    </span>
  );
}

function lineFor(it: MapItem): string {
  if (it.kind === "site") {
    const s = it.record as Site;
    const who = s.peopleTrapped > 0 ? `${s.peopleTrapped} trapped` : "No one reported trapped";
    return s.hazard ? `${who} · ${s.hazard}` : who;
  }
  if (it.kind === "shelter") {
    const h = it.record as Shelter;
    return `${Math.max(0, h.bedsTotal - h.bedsUsed)} of ${h.bedsTotal} beds free`;
  }
  if (it.kind === "road") return (it.record as Road).state === "closed" ? `Closed · ${it.note ?? ""}`.replace(/ · $/, "") : "Not confirmed";
  return it.placedAt ? `Near ${it.placedAt}` : "Problem in the field";
}

/** A site's one-line status: an amber dot when it is stuck (red stays for life-threatening).
 *  The colour is on the dot, never the text: amber text is unreadable on the light theme. */
const PHASE_DOT: Record<WorkState, string> = {
  stuck: "bg-warning", waiting: "bg-muted-foreground/50", moving: "bg-foreground", done: "bg-muted-foreground/30",
};
const PHASE_TEXT: Record<WorkState, string> = {
  stuck: "text-foreground", waiting: "text-muted-foreground", moving: "text-foreground", done: "text-muted-foreground",
};

function titleFor(it: MapItem, siteNo?: number): string {
  if (it.kind === "shelter") return (it.record as Shelter).name;
  if (it.kind === "site" && siteNo && /^(address unknown|unknown|bilinmiyor)?$/i.test(it.title.trim())) return `Site ${siteNo} · address unknown`;
  return it.title;
}

export function MapScreen({ initial, initialLive = false, focus, quakes, names }: {
  initial: MapSource; initialLive?: boolean; focus?: string; quakes: GlQuake[]; names?: Names;
}) {
  const [mode, setMode] = useState<"live" | "imagery">("live");
  const { data, live, now } = usePolled<MapSource>("/api/board", initial, 1000, initialLive);
  const items = useMemo(() => fromBoard(data, { names }), [data, names]);
  const siteNo = useMemo(() => new Map(items.filter((i) => i.kind === "site").map((i, n) => [i.key, n + 1] as const)), [items]);
  const [selected, setSelected] = useState<string | null>(focus ?? null);
  const [flyKey, setFlyKey] = useState<string | undefined>(focus);
  const [filter, setFilter] = useState<Filter>("all");

  // A new life-threatening record rings once. The first live board is the baseline.
  const [ringKeys, setRingKeys] = useState<Set<string>>(() => new Set());
  const baseline = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!live) return;
    const critical = items.filter((i) => i.actNow).map((i) => i.key);
    if (baseline.current === null) { baseline.current = new Set(critical); return; }
    const fresh = critical.filter((k) => !baseline.current!.has(k));
    if (fresh.length === 0) return;
    fresh.forEach((k) => baseline.current!.add(k));
    setRingKeys(new Set(fresh));
    const t = setTimeout(() => setRingKeys(new Set()), 1400);
    return () => clearTimeout(t);
  }, [items, live]);

  const shown = items.filter((i) => pass(filter, i));
  const life = items.filter((i) => pass("life", i)).length;
  const hazards = items.filter((i) => pass("hazard", i)).length;

  function pick(key: string | null) {
    setSelected(key);
    if (key) setFlyKey(key);
  }

  return (
    <div className="flex h-full flex-col md:flex-row">
      <aside className="order-2 flex min-h-0 flex-1 flex-col border-t bg-background md:order-1 md:w-[380px] md:flex-none md:border-t-0 md:border-r">
        <header className="space-y-3 border-b p-4">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-xl font-semibold tracking-tight">Map</h1>
            <div className="flex rounded-lg border bg-secondary/60 p-0.5">
              {([["live", "Live", MapIcon], ["imagery", "Imagery", Satellite]] as const).map(([id, label, Icon]) => (
                <button key={id} type="button" aria-pressed={mode === id} onClick={() => setMode(id)}
                  className={cn("flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    mode === id ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")}>
                  <Icon className="size-3.5" />{label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { n: items.filter((i) => i.kind === "site" || i.kind === "incident").length, label: "Places" },
              { n: life, label: "Life-threatening", act: life > 0 },
              { n: hazards, label: "Hazards", warn: hazards > 0 },
            ].map((k) => (
              <div key={k.label} className="rounded-lg border bg-card px-2.5 py-2">
                <p className={cn("font-mono text-lg font-semibold leading-none", k.act && "text-destructive")}>{k.n}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{k.label}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}
                className={cn("inline-flex h-7 shrink-0 items-center rounded-full border px-3 text-xs font-medium transition-colors",
                  filter === f.id ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent")}>
                {f.label}
              </button>
            ))}
          </div>
        </header>

        <ul className="min-h-0 flex-1 overflow-y-auto p-2">
          <AnimatePresence initial={false}>
            {shown.map((it) => (
              <motion.li key={it.key} layout initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                <button type="button" onClick={() => pick(it.key)} data-key={it.key} aria-pressed={selected === it.key}
                  className={cn("flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors",
                    selected === it.key ? "bg-secondary" : "hover:bg-accent",
                    isStale(it.staleType, it.at, now) && "opacity-70")}>
                  <KindIcon it={it} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium first-letter:uppercase">{titleFor(it, siteNo.get(it.key))}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {lineFor(it)}
                      {it.work && (
                        <span className={cn("font-medium", PHASE_TEXT[it.work.state])}>
                          {" · "}<span aria-hidden className={cn("mr-1 inline-block size-1.5 rounded-full align-middle", PHASE_DOT[it.work.state])} />{it.work.phase}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{ageText(it.at, now)}</span>
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
          {shown.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">Nothing here right now.</li>}
        </ul>
        <footer className="flex items-center gap-2 border-t px-4 py-2 text-[11px] text-muted-foreground">
          <span className={cn("size-1.5 rounded-full", live ? "bg-success" : "bg-calm")} />
          {live ? "Live from the desk" : "Offline copy"}
        </footer>
      </aside>

      <div className="relative order-1 h-[55vh] md:order-2 md:h-auto md:flex-1">
        {mode === "live"
          ? <DeskGlMap items={items} now={now} selected={selected} onPick={pick} flyKey={flyKey} quakes={quakes} ringKeys={ringKeys} />
          : <DeskMap embedded onPick={pick} initial={initial} initialLive={initialLive} focus={selected ?? undefined} />}
      </div>
    </div>
  );
}
