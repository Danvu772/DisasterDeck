// /compare: "Today vs. with the desk", the pitch opening. Same five tweets on both sides.
// Tweets are read at build time. The right half uses fixture sites from makeBoard, and says so.
import { ArrowRight, Sheet, Sparkles } from "lucide-react";
import replay from "@/data/tweets_replay.json";
import { makeBoard } from "@/fixtures/board";
import { toRows, toSites } from "@/components/compare/adapt";
import { TodayTable } from "@/components/compare/TodayTable";
import { DeskHalf } from "@/components/compare/DeskHalf";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const tweets = replay.slice(0, 5); // the five CP1 tweets; the file holds more for the x-agent replay

const card = "flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card shadow-xs";

export default function ComparePage() {
  const now = Date.now();
  const rows = toRows(tweets);
  const sites = toSites(tweets, makeBoard(now).sites, now);
  return (
    <main className="flex h-full flex-col gap-4 bg-paper p-4 md:p-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Same five posts, two ways</h1>
        <p className="text-sm text-muted-foreground">Antakya, February 2023</p>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <section className={card}>
          <header className="flex items-center gap-3 border-b px-4 py-3">
            <span className="flex size-8 items-center justify-center rounded-lg bg-secondary">
              <Sheet aria-hidden className="size-4 text-muted-foreground" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold">Today</h2>
              <p className="text-xs text-muted-foreground">A shared sheet</p>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-4"><TodayTable rows={rows} /></div>
          <footer className="border-t bg-secondary/50 px-4 py-3 text-sm font-medium">
            Five posts, four rows about one building. Nobody knows who called.
          </footer>
        </section>

        <div aria-hidden className="hidden items-center lg:flex">
          <span className="flex size-9 items-center justify-center rounded-full border bg-card shadow-xs">
            <ArrowRight className="size-4 text-muted-foreground" />
          </span>
        </div>

        <section className={card}>
          <header className="flex items-center gap-3 border-b px-4 py-3">
            <span className="flex size-8 items-center justify-center rounded-lg bg-info-soft">
              <Sparkles aria-hidden className="size-4 text-info" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold">With the desk</h2>
              <p className="text-xs text-muted-foreground">Merged sites, each with an owner</p>
            </div>
            <Badge variant="outline" className="font-normal text-muted-foreground">Demo data</Badge>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-4"><DeskHalf items={sites} now={now} /></div>
          <footer className="border-t bg-secondary/50 px-4 py-3 text-sm font-medium">
            One site, four posts counted, a volunteer is calling.
          </footer>
        </section>
      </div>
    </main>
  );
}
