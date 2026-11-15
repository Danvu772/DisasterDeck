"use client";
// /demo: the presenter's screen. Where the story is right now, and four doors to the role screens.
import { makeBoard } from "@/fixtures/board";
import { ageText, button, link, pill, statusTag } from "../encode";
import { usePolled } from "../map/usePolled";
import { newestDone, storyCounts, storySteps, type StoryBoard, type StoryEvent } from "./story";

type DemoBoard = StoryBoard & Partial<ReturnType<typeof makeBoard>>;

const ROLES = [
  { href: "/coordinator", name: "Coordinator", what: "Approves the team" },
  { href: "/agent?user=volunteer-callback", name: "Volunteer Zeynep", what: "Makes the call" },
  { href: "/field?user=field-alpha", name: "Field team", what: "Goes to the site" },
  { href: "/", name: "Board", what: "Everything on one map" },
];

export function DemoScreen({ initial }: { initial: DemoBoard }) {
  const { data: board, live, now } = usePolled<DemoBoard>("/api/board", initial);
  const feed = usePolled<StoryEvent[]>("/api/events?limit=200", [], 2000);
  const steps = storySteps(board, feed.live ? feed.data : []);
  const newest = newestDone(steps);
  const counts = storyCounts(board);
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 bg-paper px-6 py-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-4xl font-bold">The story on the desk</h1>
        <p className="text-xl text-muted">
          <span className="font-mono">{doneCount}</span> of <span className="font-mono">6</span> steps done
        </p>
      </header>
      {!live && <p className="text-lg text-muted"><span className={pill}>Demo data</span> The board API is not answering.</p>}

      <section aria-label="Counts" className="grid grid-cols-3 gap-4">
        {[
          ["Open sites", counts.sites],
          ["Open tasks", counts.tasks],
          ["Open incidents", counts.incidents],
        ].map(([label, n]) => (
          <div key={label} className="rounded-card border border-line bg-card px-4 py-3">
            <p className="font-mono text-4xl font-bold">{n}</p>
            <p className="text-lg text-muted">{label}</p>
          </div>
        ))}
      </section>

      <section aria-label="Story track">
        <h2 className="mb-3 text-2xl font-bold">Where the story is</h2>
        <ol className="flex flex-col gap-3">
          {steps.map((s, i) => {
            const isNewest = s.id === newest;
            return (
              // key includes the newest flag's step, so the flash plays once when a new step completes
              <li key={isNewest ? `${s.id}-new` : s.id}
                className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-card bg-card px-4 py-3 ${
                  s.done ? "border-2 border-ink" : "border border-dashed border-muted"} ${isNewest ? "map-flash" : ""}`}>
                <span className="font-mono text-2xl font-bold">{i + 1}</span>
                <span className={`min-w-0 flex-1 text-2xl ${s.done ? "font-bold" : "text-muted"}`}>{s.title}</span>
                <span className={statusTag}>{s.done ? "done" : "waiting"}</span>
                {s.done && (
                  <span className="text-lg">
                    {s.openKey
                      ? <a className={link} href={`/?open=${encodeURIComponent(s.openKey)}`}>{s.label}</a>
                      : s.label}
                    {s.at && <>, <span className="font-mono">{ageText(s.at, now)}</span></>}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-label="Role screens">
        <h2 className="mb-3 text-2xl font-bold">Open a role screen</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {ROLES.map((r) => (
            <a key={r.href} href={r.href} target="_blank" rel="noopener noreferrer"
              className={`${button.primary} flex flex-col gap-1 px-4 py-5 text-xl`}>
              <span>{r.name}</span>
              <span className="text-base font-normal">{r.what}</span>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
