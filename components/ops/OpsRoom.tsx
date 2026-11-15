"use client";
// /ops: the operations room for whoever runs the desk. Left, every post the research agents read
// and what the desk made of it. Middle, the map that stream builds, with the real aftershocks.
// Right, the numbers. Live from GET /api/events when the desk has posts, else the exercise replay.
import dynamic from "next/dynamic";
import { useMemo, useState, type ComponentType } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import {
  CircleSlash, Clock, FileCheck2, HeartHandshake, Inbox, MapPin, Merge, Pause, PhoneCall, Play,
  RotateCcw, Sparkles, TriangleAlert, Users,
} from "lucide-react";
import usgs from "../../agents/fixtures/usgs-kahramanmaras-2023.json";
import { SECOND_QUAKE_MIN, type OpsPost } from "@/fixtures/opsPosts";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Bars } from "../metrics/charts/Bars";
import { Count, useStagger } from "../metrics/charts/motion";
import { chip, tierBar } from "../encode";
import {
  localTime, minutesAfterQuake, OUTCOME_TAG, outcomeText, outcomeTier, pinsOf, summarize, type OpsSummary, type Quake,
} from "./opsModel";
import { useOpsFeed } from "./useOpsFeed";

const OpsMap = dynamic(() => import("./OpsMap"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-none" />,
});

const QUAKES: Quake[] = usgs.events.map((e) => ({ id: e.id, time: e.time, mag: e.mag, place: e.place, lat: e.lat, lon: e.lon }));
const card = "rounded-xl border bg-card shadow-xs";
const spring = { type: "spring", stiffness: 350, damping: 35 } as const;

type Filter = "all" | "life" | "needs" | "copies" | "none";
const FILTERS: { id: Filter; label: string; keep: (p: OpsPost) => boolean }[] = [
  { id: "all", label: "All", keep: () => true },
  { id: "life", label: "Life-threatening", keep: (p) => outcomeTier(p.outcome).tier === 0 },
  { id: "needs", label: "Needs and logistics", keep: (p) => ["need", "road", "shelter"].includes(p.outcome.kind) },
  { id: "copies", label: "Merged and held", keep: (p) => ["copy", "held", "unclear"].includes(p.outcome.kind) },
  { id: "none", label: "No record", keep: (p) => p.outcome.kind === "none" },
];

type Icon = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

function Kpi({ i, label, value, icon: Icon, act, note }: {
  i: number; label: string; value: number; icon: Icon; act?: boolean; note?: string;
}) {
  const { entered, delay } = useStagger(i);
  const hot = act && value > 0;
  return (
    <div className={cn(card, "flex flex-col gap-1 p-3", hot && "border-destructive/30")}>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate">{label}</span>
        <Icon aria-hidden className={cn("size-4 shrink-0", hot && "text-destructive")} />
      </div>
      <p className={cn("text-2xl font-semibold tracking-tight tabular-nums", hot && "text-destructive")}>
        <span className="sr-only">{value}</span>
        <Count value={value} entered={entered} delay={delay} />
      </p>
      {note && <p className="truncate text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

function OutcomeBadge({ p }: { p: OpsPost }) {
  const { tier, actNow } = outcomeTier(p.outcome);
  const word = OUTCOME_TAG[p.outcome.kind];
  if (actNow) return <Badge variant="destructive" className="shrink-0">{word}</Badge>;
  return (
    <Badge variant="outline" className="shrink-0 bg-background font-normal">
      <span aria-hidden className={cn("size-1.5 rounded-full", tier === 1 ? "bg-warning" : "bg-calm")} />
      {word}
    </Badge>
  );
}

function PostLine({ p }: { p: OpsPost }) {
  const { tier, actNow } = outcomeTier(p.outcome);
  const main = p.textEn || p.text;
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={spring}
      className="flex gap-3 px-4 py-3"
    >
      <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${tierBar(tier, actNow)}`} />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{p.author}</span>
          {p.district && (
            <span className="inline-flex min-w-0 items-center gap-0.5 truncate">
              <MapPin aria-hidden className="size-3 shrink-0" />{p.district}
            </span>
          )}
          {p.accountAgeDays === 0 && (
            <Badge variant="outline" className="font-normal">
              <span aria-hidden className="size-1.5 rounded-full bg-warning" />New account
            </Badge>
          )}
          <span className="ml-auto shrink-0 font-mono">{localTime(p.at)}</span>
        </div>
        <p className="text-sm leading-snug">{main}</p>
        {p.textEn && p.text && <p className="text-xs leading-snug text-muted-foreground" lang="tr">{p.text}</p>}
        <div className="flex items-start gap-2 rounded-lg bg-info-soft px-2.5 py-1.5 text-xs">
          <Sparkles aria-hidden className="mt-0.5 size-3.5 shrink-0 text-info" />
          <span className="min-w-0 flex-1 leading-snug"><span className="sr-only">Desk: </span>{outcomeText(p.outcome)}</span>
          <OutcomeBadge p={p} />
        </div>
      </div>
    </motion.li>
  );
}

function PerHour({ rows }: { rows: OpsSummary["perHour"] }) {
  const max = Math.max(1, ...rows.map((r) => r.posts));
  return (
    <div>
      <p className="sr-only">{rows.map((r) => `${r.label}:00, ${r.posts} posts, ${r.quakes} aftershocks of M5 or more`).join(". ")}</p>
      <div aria-hidden className="flex h-28 items-end gap-1">
        {rows.map((r, i) => (
          <div key={r.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="font-mono text-[11px] text-muted-foreground">{r.posts}</span>
            <div
              className={cn("w-full rounded-t-sm transition-[height] duration-300 ease-out",
                i === rows.length - 1 ? "bg-primary" : "bg-foreground/25")}
              style={{ height: `${(r.posts / max) * 78}%` }}
            />
          </div>
        ))}
      </div>
      <div aria-hidden className="mt-1 flex gap-1 border-t pt-1.5 text-[11px] text-muted-foreground">
        {rows.map((r) => <span key={r.label} className="flex-1 text-center font-mono">{r.label}</span>)}
      </div>
      <div aria-hidden className="mt-1 flex gap-1">
        {rows.map((r) => (
          <span key={r.label} className="flex flex-1 justify-center">
            {r.quakes > 0 && (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-warning px-1 font-mono text-[10px] font-medium text-warning-foreground">
                {r.quakes}
              </span>
            )}
          </span>
        ))}
      </div>
      <p aria-hidden className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-foreground/25" />Posts, local hour</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-warning" />M5+ aftershocks</span>
      </p>
    </div>
  );
}

function Panel({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <article className={cn(card, "p-4")}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {aside && <span className="text-xs text-muted-foreground">{aside}</span>}
      </header>
      {children}
    </article>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-muted-foreground">{children}</p>;

export function OpsRoom() {
  const feed = useOpsFeed();
  const [filter, setFilter] = useState<Filter>("all");
  const posts = feed.posts;
  const last = posts[posts.length - 1];
  const lastMs = last ? Date.parse(last.at) : 0;
  const quakes = useMemo(() => QUAKES.filter((q) => Date.parse(q.time) <= lastMs), [lastMs]);
  const s = useMemo(() => summarize(posts, quakes), [posts, quakes]);
  const pins = useMemo(() => pinsOf(posts), [posts]);
  const keep = FILTERS.find((f) => f.id === filter)!.keep;
  const listed = posts.filter(keep).slice(-80).reverse();
  const minute = last ? minutesAfterQuake(last.at) : 0;
  const freshKey = last ? (last.outcome.kind === "site" || last.outcome.kind === "copy" || last.outcome.kind === "rescued" ? last.outcome.site : last.id) : undefined;
  const secondShock = minute >= SECOND_QUAKE_MIN && minute < SECOND_QUAKE_MIN + 45;
  const progress = feed.total ? posts.length / feed.total : 0;

  return (
    <MotionConfig reducedMotion="user">
      <main className="flex flex-col gap-4 p-4 md:p-6 xl:h-full">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">Operations room</h1>
              {feed.isLive ? (
                <Badge variant="outline" className="font-normal">
                  <span aria-hidden className="relative flex size-1.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-success" />
                  </span>
                  Live
                </Badge>
              ) : (
                <Badge variant="secondary" className="font-normal">Exercise replay</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Malatya, 6 Feb 2023{feed.isLive ? "" : " · synthetic posts, real USGS aftershocks"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {last && (
              <div className="inline-flex h-8 items-center gap-1.5 rounded-lg border bg-card px-2.5 text-sm shadow-xs">
                <Clock aria-hidden className="size-4 text-muted-foreground" />
                <span className="font-mono font-medium">{localTime(last.at)}</span>
                <span className="text-muted-foreground">hour <span className="font-mono">{Math.floor(minute / 60) + 1}</span></span>
              </div>
            )}
            {!feed.isLive && (
              <>
                <div className="inline-flex h-8 items-center gap-0.5 rounded-lg border bg-card p-0.5 shadow-xs">
                  <Button type="button" variant="ghost" size="icon-xs" onClick={() => feed.setPlaying(!feed.playing)}
                    aria-label={feed.playing ? "Pause" : "Play"}>
                    {feed.playing ? <Pause aria-hidden /> : <Play aria-hidden />}
                  </Button>
                  {[1, 4].map((x) => (
                    <Button key={x} type="button" size="xs" variant={feed.speed === x ? "secondary" : "ghost"}
                      onClick={() => feed.setSpeed(x)} aria-pressed={feed.speed === x} className="font-mono">
                      {x}×
                    </Button>
                  ))}
                  <Button type="button" variant="ghost" size="icon-xs" onClick={feed.restart} aria-label="Restart">
                    <RotateCcw aria-hidden />
                  </Button>
                </div>
                <div className="flex w-28 flex-col gap-1" title={`${posts.length} of ${feed.total} posts`}>
                  <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${progress * 100}%` }} />
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    <span className="font-mono">{posts.length}</span> / <span className="font-mono">{feed.total}</span> posts
                  </span>
                </div>
              </>
            )}
          </div>
        </header>

        <AnimatePresence initial={false}>
          {secondShock && (
            <motion.div
              role="status"
              initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={spring}
              className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive-soft px-4 py-2.5 text-sm"
            >
              <TriangleAlert aria-hidden className="size-4 shrink-0 text-destructive" />
              <span><span className="font-semibold">Second main shock, M7.5 Elbistan, 13:24.</span>{" "}
                <span className="text-muted-foreground">New collapse reports incoming.</span></span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
          <Kpi i={0} label="Posts read" value={s.read} icon={Inbox} />
          <Kpi i={1} label="Records made" value={s.records} icon={FileCheck2} />
          <Kpi i={2} label="Copies merged" value={s.copies} icon={Merge} />
          <Kpi i={3} label="Still trapped" value={s.trappedOpen} icon={Users} act note={`at ${s.sitesOpen} open sites`} />
          <Kpi i={4} label="Rescued alive" value={s.rescued} icon={HeartHandshake} />
          <Kpi i={5} label="Held for a call" value={s.held} icon={PhoneCall} />
          <Kpi i={6} label="Not a request" value={s.notRequest} icon={CircleSlash} />
        </div>

        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)_minmax(0,22rem)]">
          <section aria-label="Incoming posts" className={cn(card, "flex max-h-[80vh] min-h-0 flex-col overflow-hidden xl:max-h-none")}>
            <div className="space-y-3 border-b p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Incoming posts</h2>
                <span className="text-xs text-muted-foreground">Newest first</span>
              </div>
              <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
                {FILTERS.map((f) => (
                  <button key={f.id} type="button" className={chip(filter === f.id)} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                    {f.label}
                    <span className={cn("font-mono", filter !== f.id && "text-muted-foreground")}>{posts.filter(f.keep).length}</span>
                  </button>
                ))}
              </div>
            </div>
            <ul className="min-h-0 flex-1 divide-y overflow-y-auto" aria-live="polite">
              <AnimatePresence initial={false}>
                {listed.map((p) => <PostLine key={p.id} p={p} />)}
              </AnimatePresence>
              {!listed.length && <li className="p-6 text-center text-sm text-muted-foreground">No posts here yet.</li>}
            </ul>
          </section>

          <section aria-label="Map" className={cn(card, "relative h-[60vh] overflow-hidden xl:h-auto")}>
            <OpsMap pins={pins} quakes={quakes} freshKey={freshKey} />
          </section>

          <section aria-label="Numbers" className="space-y-4 lg:col-span-2 xl:col-span-1 xl:min-h-0 xl:overflow-y-auto">
            <Panel title="Posts per hour">
              <PerHour rows={s.perHour} />
            </Panel>
            <Panel title="What the posts became" aside={<><span className="font-mono">{s.read}</span> posts</>}>
              <Bars points={s.byOutcome} />
            </Panel>
            <Panel title="Still trapped, by district" aside="Open sites">
              {s.districts.length ? <Bars points={s.districts} unit="people" /> : <Empty>None yet.</Empty>}
            </Panel>
            <Panel title="Needs asked for" aside="Total quantity">
              {s.needs.length ? <Bars points={s.needs} /> : <Empty>None yet.</Empty>}
            </Panel>
            <Panel title="Shelters" aside="Beds used">
              {s.shelters.length ? <Bars points={s.shelters} unit="beds" /> : <Empty>None yet.</Empty>}
            </Panel>
          </section>
        </div>
      </main>
    </MotionConfig>
  );
}
