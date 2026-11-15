"use client";
// The desk feed under the map: every event entering the desk, newest first (v1's feed from /agent).
// Clicking an entry selects the record it touched. Zone alerts and unprocessed events have no
// record on the board, so those open the event report on /agent instead.
import { useRouter } from "next/navigation";
import type { Event } from "@/lib/types";
import { users } from "@/fixtures/desk";
import { EventRow } from "../EventRow";
import { usePolled } from "../map/usePolled";
import { recordKind } from "../event/recordKind";
import type { Board } from "../BoardCards";
import { type DetailKind, findRecord } from "../detail/locate";

export type FeedEvent = Event & { _id: string };

const nameOf = (id: string) => users.find((u) => u._id === id)?.name ?? id;

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

export function DeskFeed({ board, now, onOpen, initial, initialLive = false }: {
  board: Board; now: number; onOpen: (key: string) => void; initial: FeedEvent[]; initialLive?: boolean;
}) {
  const router = useRouter();
  const { data, live } = usePolled<FeedEvent[]>("/api/events?limit=30", initial, 2000, initialLive);
  const events = newestFirst(data);
  return (
    <section aria-label="Desk feed" className="flex min-h-0 flex-1 flex-col rounded-card border border-line bg-card">
      <header className="flex shrink-0 items-baseline gap-2 border-b border-line px-3 py-2">
        <h2 className="font-bold">Desk feed</h2>
        <span className="text-xs text-muted">every event, newest first</span>
        {!live && <span className="ml-auto text-xs text-muted">Demo data, the events API is not answering.</span>}
      </header>
      {events.length === 0 && <p className="p-3 text-sm text-muted">No events yet.</p>}
      <ul className="min-h-0 flex-1 overflow-y-auto px-2">
        {events.map((e) => (
          <EventRow key={e._id} e={e} now={now} actorName={nameOf(e.actor)} onOpen={() => {
            const key = touched(e, board);
            if (key) onOpen(key);
            else router.push(`/agent?event=${encodeURIComponent(e._id)}`);
          }} />
        ))}
      </ul>
    </section>
  );
}
