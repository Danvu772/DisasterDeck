"use client";
// /ops: the operations room for whoever runs the desk. Left, every post the research agents read
// and what the desk made of it. Middle, the map that stream builds, with the real aftershocks.
// Right, the numbers. Live from GET /api/events when the desk has posts, else the exercise replay.
// New posts join the top of the list one at a time and push the rest down. A number panel with
// nothing in it yet (no shelters reported, say) shows the exercise's numbers, marked "Sample".
import { pilot } from "@/lib/pilot";
import dynamic from "next/dynamic";
import { useMemo, useState, type ComponentType } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import {
  CircleSlash, Clock, FileCheck2, HeartHandshake, Inbox, MapPin, Merge, Pause, PhoneCall, Play,
  RotateCcw, Sparkles, TriangleAlert, Users,
} from "lucide-react";
import { makeOpsPosts, SECOND_QUAKE_MIN, type OpsPost } from "@/fixtures/opsPosts";
import { cn } from "@/lib/utils";
import { Button, Tag } from "@trussworks/react-uswds";
import { Bars } from "../metrics/charts/Bars";
import type { MetricPoint } from "../metrics/types";
import { Count, useStagger } from "../metrics/charts/motion";
import { chip, tierBar } from "../encode";
import {
  localTime, minutesAfterQuake, OUTCOME_TAG, outcomeText, outcomeTier, pinsOf, summarize, type OpsSummary, type Quake,
} from "./opsModel";
import { useOpsFeed } from "./useOpsFeed";

const OpsMap = dynamic(() => import("./OpsMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-secondary" />,
});

// No earthquake feed below the queue yet (D-0017): the quake bits of this screen stay hidden while this is empty.
const QUAKES: Quake[] = [];
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
  if (actNow) return <Tag className="shrink-0 bg-destructive text-destructive-foreground">{word}</Tag>;
  return (
    <Tag className="shrink-0 bg-background font-normal">
      <span aria-hidden className={cn("size-1.5 rounded-full", tier === 1 ? "bg-warning" : "bg-calm")} />
      {word}
    </Tag>
  );
}

// A new post slides in from above and the list below moves down to make room (layout).
// The newest one keeps a soft highlight until the next arrives.
function PostLine({ p, fresh }: { p: OpsPost; fresh: boolean }) {
  const { tier, actNow } = outcomeTier(p.outcome);
  const main = p.textEn || p.text;
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: -18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      transition={spring}
      className={cn("flex gap-3 px-4 py-3 transition-colors duration-1000", fresh && "bg-accent")}
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
            <Tag className="font-normal">
              <span aria-hidden className="size-1.5 rounded-full bg-warning" />New account
            </Tag>
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
      <p className="sr-only">{rows.map((r) => `${r.label}:00, ${r.posts} posts${r.quakes > 0 ? `, ${r.quakes} earthquakes of M5 or more` : ""}`).join(". ")}</p>
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
      {rows.some((r) => r.quakes > 0) && <div aria-hidden className="mt-1 flex gap-1">
        {rows.map((r) => (
          <span key={r.label} className="flex flex-1 justify-center">
            {r.quakes > 0 && (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-warning px-1 font-mono text-[10px] font-medium text-warning-foreground">
                {r.quakes}
              </span>
            )}
          </span>
        ))}
      </div>}
      <p aria-hidden className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-foreground/25" />Posts, local hour</span>
        {rows.some((r) => r.quakes > 0) && <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-warning" />M5+ earthquakes</span>}
      </p>
    </div>
  );
}

function Panel({ title, aside, sample, children }: {
  title: string; aside?: React.ReactNode; sample?: boolean; children: React.ReactNode;
}) {
  return (
    <article className={cn(card, "p-4")}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {sample && <Tag className="font-normal" title="Nothing reported yet, these are the exercise's numbers">Sample</Tag>}
          {aside}
        </span>
      </header>
      {children}
    </article>
  );
}

// A panel's own numbers, or the exercise's when it has nothing above zero yet.
const orSample = (own: MetricPoint[], sample: MetricPoint[]) =>
  own.some((p) => p.value > 0) ? { points: own, sample: false } : { points: sample, sample: true };

export function OpsRoom({ deskId }: { deskId: string }) {
  const feed = useOpsFeed();
  const [filter, setFilter] = useState<Filter>("all");
  const posts = feed.posts;
  const last = posts[posts.length - 1];
  const lastMs = last ? Date.parse(last.at) : 0;
  const quakes = useMemo(() => feed.isLive ? [] : QUAKES.filter((q) => Date.parse(q.time) <= lastMs), [feed.isLive, lastMs]);
  const s = useMemo(() => summarize(posts, quakes, { live: feed.isLive }), [posts, quakes, feed.isLive]);
  // The whole exercise, summed once: what an empty panel shows instead of "None yet".
  const sample = useMemo(() => summarize(makeOpsPosts(), QUAKES), []);
  const districts = orSample(s.districts, sample.districts);
  const needs = orSample(s.needs, sample.needs);
  const shelters = orSample(s.shelters, sample.shelters);
  const pins = useMemo(() => pinsOf(posts), [posts]);
  const keep = FILTERS.find((f) => f.id === filter)!.keep;
  const listed = posts.filter(keep).slice(-80).reverse();
  const minute = last ? minutesAfterQuake(last.at) : 0;
  const freshKey = last ? (last.outcome.kind === "site" || last.outcome.kind === "copy" || last.outcome.kind === "rescued" ? last.outcome.site : last.id) : undefined;
  const secondShock = !feed.isLive && minute >= SECOND_QUAKE_MIN && minute < SECOND_QUAKE_MIN + 45;
  const progress = feed.total ? posts.length / feed.total : 0;

  return (
    <MotionConfig reducedMotion="user">
      <main className="flex flex-col gap-4 p-4 md:p-6 xl:h-full">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">Operations room</h1>
              {feed.isLive ? (
                <Tag className="font-normal">
                  <span aria-hidden className="relative flex size-1.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-success" />
                  </span>
                  Live
                </Tag>
              ) : (
                <Tag className="font-normal">Exercise replay</Tag>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {feed.isLive && deskId !== pilot.id ? deskId : pilot.name}{feed.isLive ? " · live desk events" : " · 6 Feb 2023 · synthetic posts"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {last && (
              <div className="inline-flex h-8 items-center gap-1.5 rounded-lg border bg-card px-2.5 text-sm shadow-xs">
                <Clock aria-hidden className="size-4 text-muted-foreground" />
                <span className="font-mono font-medium">{localTime(last.at)}</span>
                {!feed.isLive && <span className="text-muted-foreground">hour <span className="font-mono">{Math.floor(minute / 60) + 1}</span></span>}
              </div>
            )}
            {!feed.isLive && (
              <>
                <div className="inline-flex h-8 items-center gap-0.5 rounded-lg border bg-card p-0.5 shadow-xs">
                  <Button type="button" unstyled onClick={() => feed.setPlaying(!feed.playing)}
                    aria-label={feed.playing ? "Pause" : "Play"}
                    className="grid size-6 place-items-center rounded-md text-foreground hover:bg-accent">
                    {feed.playing ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="size-4" />}
                  </Button>
                  {[1, 4].map((x) => (
                    <Button key={x} type="button" unstyled
                      onClick={() => feed.setSpeed(x)} aria-pressed={feed.speed === x}
                      className={cn("rounded-md px-1.5 py-0.5 font-mono", feed.speed === x ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-accent")}>
                      {x}×
                    </Button>
                  ))}
                  <Button type="button" unstyled onClick={feed.restart} aria-label="Restart"
                    className="grid size-6 place-items-center rounded-md text-foreground hover:bg-accent">
                    <RotateCcw aria-hidden className="size-4" />
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

        {/* xl: one row exactly as tall as what is left of the screen, so the post list scrolls inside
            its card instead of stretching the page (it used to leave a tall empty strip below). */}
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)_minmax(0,22rem)] xl:grid-rows-[minmax(0,1fr)]">
          <section aria-label="Incoming posts" className={cn(card, "flex max-h-[80vh] min-h-0 flex-col overflow-hidden xl:h-full xl:max-h-none")}>
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
            {/* relative: the posts' screen-reader text (sr-only, position absolute) stays inside this
                scroll box. Without it, it hung below the page and made the window scroll ~10,000 px. */}
            {/* keyed by source: when the live desk takes over from the replay, the list starts fresh
                instead of fading 14 replay posts out above the live ones. */}
            <ul key={feed.isLive ? "live" : "replay"} className="relative min-h-0 flex-1 divide-y overflow-y-auto" aria-live="polite">
              <AnimatePresence initial={false}>
                {listed.map((p, i) => <PostLine key={p.id} p={p} fresh={i === 0 && p.id === last?.id} />)}
              </AnimatePresence>
              {!listed.length && <li className="p-6 text-center text-sm text-muted-foreground">No posts here yet.</li>}
            </ul>
          </section>

          <section aria-label="Map" className={cn(card, "relative h-[60vh] overflow-hidden xl:h-auto")}>
            <OpsMap pins={pins} quakes={quakes} freshKey={freshKey} />
          </section>

          <section aria-label="Numbers" className="relative space-y-4 lg:col-span-2 xl:col-span-1 xl:h-full xl:min-h-0 xl:overflow-y-auto">
            <Panel title="Posts per hour">
              <PerHour rows={s.perHour} />
            </Panel>
            <Panel title="What the posts became" aside={<><span className="font-mono">{s.read}</span> posts</>}>
              <Bars points={s.byOutcome} />
            </Panel>
            <Panel title="Still trapped, by area" aside="Open sites" sample={districts.sample}>
              <Bars points={districts.points} unit="people" />
            </Panel>
            <Panel title="Needs asked for" aside="Total quantity" sample={needs.sample}>
              <Bars points={needs.points} />
            </Panel>
            <Panel title="Shelters" aside="Beds used" sample={shelters.sample}>
              <Bars points={shelters.points} unit="beds" />
            </Panel>
          </section>
        </div>
      </main>
    </MotionConfig>
  );
}
