"use client";
// The desk feed under the map: every event entering the desk, newest first (v1's feed from /agent).
// Clicking an entry selects the record it touched. Zone alerts and unprocessed events have no
// record on the board, so those open the event report on /agent instead.
import { AnimatePresence } from "motion/react";
import { useRouter } from "next/navigation";
import type { Event } from "@/lib/types";
import { users } from "@/fixtures/desk";
import { EventRow } from "../EventRow";
import { usePolled } from "../map/usePolled";
import { recordKind } from "../event/recordKind";
import type { Board } from "../BoardCards";
import { type DetailKind, findRecord } from "../detail/locate";
import { actorLabel } from "../detail/fields";

export type FeedEvent = Event & { _id: string };

const nameOf = (id: string) => users.find((u) => u._id === id)?.name ?? actorLabel(id);

// GET /api/events returns oldest first. The feed reads newest first.
export function newestFirst(events: FeedEvent[]): FeedEvent[] {
  return [...events].sort((a, b) => +new Date(b.ts) - +new Date(a.ts));
}

const KINDS: DetailKind[] = ["site", "incident", "need", "task", "shelter", "road"];

// The board record an event touched, as "<kind>:<id>", or null when the board does not hold it.
// The event type says the kind first. An answer can point at the site it verified, so the other kinds are tried after.
export function touched(e: FeedEvent, board: Board): string | null {
  const first = recordKind(e);
  if (first === "zone") return null;
  for (const id of e.result?.recordIds ?? []) {
    const kind = [...(first ? [first] : []), ...KINDS].find((k) => findRecord(board, k, id));
    if (kind) return `${kind}:${id}`;
  }
  return null;
}

export function DeskFeed({ board, now, onOpen, initial }: {
  board: Board; now: number; onOpen: (key: string) => void; initial: FeedEvent[];
}) {
  const router = useRouter();
  const { data, live } = usePolled<FeedEvent[]>("/api/events?limit=30", initial, 2000);
  const events = newestFirst(data);
  return (
    <section aria-label="Desk feed" className="flex min-h-0 flex-1 flex-col rounded-xl border bg-card shadow-xs">
      <header className="flex shrink-0 items-center gap-2 px-4 pb-1 pt-3">
        <h2 className="text-sm font-semibold">Desk feed</h2>
        {live ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span aria-hidden className="relative flex size-1.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-60 motion-reduce:hidden" />
              <span className="relative size-1.5 rounded-full bg-success" />
            </span>
            Live
          </span>
        ) : <span className="rounded-full border px-2 text-xs text-muted-foreground">Demo data</span>}
      </header>
      {events.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">No events yet.</p>}
      <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <AnimatePresence initial={false}>
          {events.map((e) => (
            <EventRow key={e._id} e={e} now={now} actorName={nameOf(e.actor)} onOpen={() => {
              const key = touched(e, board);
              if (key) onOpen(key);
              else router.push(`/agent?event=${encodeURIComponent(e._id)}`);
            }} />
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}
