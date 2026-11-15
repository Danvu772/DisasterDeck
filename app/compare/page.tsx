// /compare: "Today vs. with the desk", the pitch opening. Same five tweets on both sides.
// Tweets are read at build time. The right half uses fixture sites from makeBoard, and says so.
import tweets from "@/data/tweets_replay.json";
import { makeBoard } from "@/fixtures/board";
import { toRows, toSites } from "@/components/compare/adapt";
import { TodayTable } from "@/components/compare/TodayTable";
import { DeskHalf } from "@/components/compare/DeskHalf";

export const dynamic = "force-dynamic";

export default function ComparePage() {
  const now = Date.now();
  const rows = toRows(tweets);
  const sites = toSites(tweets, makeBoard(now).sites, now);
  return (
    <main className="grid h-full grid-cols-2 gap-6 px-6 py-4">
      <section className="flex min-h-0 flex-col">
        <h2 className="text-xl font-bold">Today (Malatya, 2023)</h2>
        <p className="mb-2 text-xs text-muted">The same five tweets, as a sheet.</p>
        <div className="min-h-0 flex-1"><TodayTable rows={rows} /></div>
        <p className="mt-2 text-lg">Five posts, four rows about one building, nobody knows who called.</p>
      </section>
      <section className="flex min-h-0 flex-col">
        <h2 className="text-xl font-bold">With the desk</h2>
        <p className="mb-2 text-xs text-muted">Demo data</p>
        <div className="min-h-0 flex-1"><DeskHalf items={sites} now={now} /></div>
        <p className="mt-2 text-lg">One site, four posts counted, a volunteer is calling.</p>
      </section>
    </main>
  );
}
