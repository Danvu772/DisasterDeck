// One answer shared by every request for a short while (speed, 15 Nov).
// Every open screen polls /api/board every second and /api/health every 5 s. On the 1-vCPU VM
// each poll read 12 collections from Atlas and re-encoded the whole board, so ten open tabs kept
// the CPU busy and page loads waited in line. Now the first request in a window reads, requests
// that arrive while it runs share that read, and the rest get the copy until it is ttlMs old.
// A failed read is dropped at once, so the next request tries again.
import type { Document } from "mongodb";
import { cols, getHealth, listUsers } from "./db";

type Entry<T> = { at: number; value: Promise<T>; done?: boolean; last?: T; next?: Promise<T> };
const g = globalThis as typeof globalThis & { __deskShared?: Map<string, Entry<unknown>> };
const memo = (g.__deskShared ??= new Map<string, Entry<unknown>>());

/**
 * `read()` once per `ttlMs`, shared by every caller. With `staleMs`, a copy older than ttlMs but
 * younger than staleMs is answered at once while one fresh read runs in the background, so a
 * slow read (the board takes ~1 s on the VM) never makes a poll or a page wait.
 */
export function shared<T>(key: string, ttlMs: number, read: () => Promise<T>, staleMs = 0): Promise<T> {
  const hit = memo.get(key) as Entry<T> | undefined;
  const age = hit ? Date.now() - hit.at : Infinity;
  if (hit && (age < ttlMs || !hit.done)) return hit.value; // fresh, or the first read is still running
  if (hit && hit.last !== undefined && age < staleMs) {
    if (!hit.next) {
      hit.next = read();
      hit.next.then((v) => { memo.set(key, { at: Date.now(), value: Promise.resolve(v), done: true, last: v }); },
        () => { hit.next = undefined; });
    }
    return Promise.resolve(hit.last);
  }
  const entry: Entry<T> = { at: Date.now(), value: read() };
  memo.set(key, entry);
  entry.value.then((v) => { entry.done = true; entry.last = v; }, () => { if (memo.get(key) === entry) memo.delete(key); });
  return entry.value;
}

const BOARD_TTL_MS = 1000;

// Screens show a record's first history entry (when it was opened), its newest ones and a short
// timeline. The Brain appends an entry per corroborating post, so a busy road had 368 entries and
// history was 92% of a 450 KB board that every tab downloaded each second. Screens get the first
// entry plus the newest HISTORY_KEEP; the database and the agents keep the whole history.
const HISTORY_KEEP = 12;
// Trimmed in the database, so the VM neither downloads nor decodes the long history.
const TRIM: Document = {
  $set: {
    history: {
      $cond: [
        { $gt: [{ $size: { $ifNull: ["$history", []] } }, HISTORY_KEEP + 1] },
        { $concatArrays: [{ $slice: ["$history", 1] }, { $slice: ["$history", -HISTORY_KEEP] }] },
        "$history",
      ],
    },
  },
};

/** The board the screens get: getBoard()'s shape and order, history trimmed. */
async function screenBoard(desk: string) {
  const c = await cols();
  const rows = <T extends Document>(col: { aggregate: (p: Document[]) => { toArray: () => Promise<T[]> } }, sort: Document) =>
    col.aggregate([{ $match: { deskId: desk } }, { $sort: sort }, TRIM]).toArray();
  const byPriority = { tier: 1, priority: -1 };
  const [sites, needs, roads, shelters, zones, incidents, tasks, health] = await Promise.all([
    rows(c.sites, byPriority), rows(c.needs, byPriority), rows(c.roads, { observedAt: -1 }),
    rows(c.shelters, { name: 1 }), rows(c.zones, { name: 1 }), rows(c.incidents, { _id: -1 }),
    rows(c.tasks, byPriority), shared("health", 2000, getHealth),
  ]);
  return { sites, needs, roads, shelters, zones, incidents, tasks, health };
}

/** GET /api/board's body, encoded once per window and shared by the API and the pages.
 *  Up to BOARD_STALE_MS old while a fresh read runs: the screens poll every second anyway. */
const BOARD_STALE_MS = 15_000;
export function boardJson(desk: string): Promise<string> {
  return shared(`board-json:${desk}`, BOARD_TTL_MS, async () => JSON.stringify(await screenBoard(desk)), BOARD_STALE_MS);
}

/** The desk's people (names for cards). They change rarely. */
export function sharedUsers(desk: string) {
  return shared(`users:${desk}`, 30_000, () => listUsers(desk), 10 * 60_000);
}
