"use client";
// /demo: the presenter's screen. Where the story is right now, and four doors to the role screens.
import { ArrowUpRight, CircleCheck, CircleDashed, ClipboardList, Map as MapIcon, PhoneCall, ShieldCheck, Siren, Truck } from "lucide-react";
import { makeBoard } from "@/fixtures/board";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ageText } from "../encode";
import { usePolled } from "../map/usePolled";
import { newestDone, storyCounts, storySteps, type StoryBoard, type StoryEvent } from "./story";

type DemoBoard = StoryBoard & Partial<ReturnType<typeof makeBoard>>;

const ROLES = [
  { href: "/coordinator", name: "Coordinator", what: "Approves the team", icon: ShieldCheck },
  { href: "/agent?user=volunteer-callback", name: "Volunteer Zeynep", what: "Makes the call", icon: PhoneCall },
  { href: "/field?user=field-alpha", name: "Field team", what: "Goes to the site", icon: Truck },
  { href: "/", name: "Board", what: "Everything on one map", icon: MapIcon },
];

const card = "rounded-xl border bg-card shadow-xs";

export function DemoScreen({ initial }: { initial: DemoBoard }) {
  const { data: board, live, now } = usePolled<DemoBoard>("/api/board", initial);
  const feed = usePolled<StoryEvent[]>("/api/events?limit=200", [], 2000);
  const steps = storySteps(board, feed.live ? feed.data : []);
  const newest = newestDone(steps);
  const counts = storyCounts(board);
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 bg-paper p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">The story on the desk</h1>
            {!live && <Badge variant="outline" className="font-normal text-muted-foreground">Demo data</Badge>}
          </div>
          <p className="text-muted-foreground">
            <span className="font-mono text-foreground">{doneCount}</span> of <span className="font-mono">{steps.length}</span> steps done
          </p>
        </div>
        <div aria-hidden className="flex w-full max-w-xs gap-1.5">
          {steps.map((s) => (
            <span key={s.id} className={cn("h-2 flex-1 rounded-full transition-colors", s.done ? "bg-primary" : "bg-secondary")} />
          ))}
        </div>
      </header>

      <section aria-label="Counts" className="grid grid-cols-3 gap-4">
        {([
          ["Open sites", counts.sites, Siren],
          ["Open tasks", counts.tasks, ClipboardList],
          ["Open incidents", counts.incidents, ShieldCheck],
        ] as const).map(([label, n, Icon]) => (
          <div key={label} className={cn(card, "p-5")}>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{label}</span>
              <Icon aria-hidden className="size-5" />
            </div>
            <p className="mt-2 font-mono text-4xl font-semibold tracking-tight">{n}</p>
          </div>
        ))}
      </section>

      <section aria-label="Story track" className={cn(card, "p-2")}>
        <ol>
          {steps.map((s, i) => {
            const isNewest = s.id === newest;
            return (
              // key includes the newest flag's step, so the flash plays once when a new step completes
              <li key={isNewest ? `${s.id}-new` : s.id}
                className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-4 py-3", isNewest && "map-flash bg-secondary")}>
                {s.done
                  ? <CircleCheck aria-hidden className="size-7 shrink-0 text-primary" />
                  : <CircleDashed aria-hidden className="size-7 shrink-0 text-muted-foreground/60" />}
                <span className="w-6 font-mono text-sm text-muted-foreground">{i + 1}</span>
                <span className={cn("min-w-0 flex-1 text-xl", s.done ? "font-medium" : "text-muted-foreground")}>{s.title}</span>
                {s.done ? (
                  <span className="text-base text-muted-foreground">
                    {s.openKey
                      ? <a className="font-medium text-foreground underline-offset-4 hover:underline" href={`/?open=${encodeURIComponent(s.openKey)}`}>{s.label}</a>
                      : <span className="text-foreground">{s.label}</span>}
                    {s.at && <> · <span className="font-mono">{ageText(s.at, now)}</span></>}
                  </span>
                ) : (
                  <Badge variant="outline" className="font-normal text-muted-foreground">Waiting</Badge>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-label="Role screens">
        <h2 className="mb-3 text-sm font-semibold">Open a role screen</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {ROLES.map(({ href, name, what, icon: Icon }) => (
            <a key={href} href={href} target="_blank" rel="noopener noreferrer"
              className={cn(card, "group flex flex-col gap-3 p-5 transition-colors hover:bg-accent")}>
              <div className="flex items-center justify-between">
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Icon aria-hidden className="size-5" />
                </span>
                <ArrowUpRight aria-hidden className="size-5 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </div>
              <div>
                <p className="text-lg font-semibold">{name}</p>
                <p className="text-sm text-muted-foreground">{what}</p>
              </div>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
