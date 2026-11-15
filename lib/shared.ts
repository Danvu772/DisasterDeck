// One answer shared by every request for a short while (speed, 15 Nov).
// Every open screen polls /api/board every second and /api/health every 5 s. On the 1-vCPU VM
// each poll read 12 collections from Atlas and re-encoded the whole board, so ten open tabs kept
// the CPU busy and page loads waited in line. Now the first request in a window reads, requests
// that arrive while it runs share that read, and the rest get the copy until it is ttlMs old.
// A failed read is dropped at once, so the next request tries again.
import { getBoard, listUsers } from "./db";

type Entry<T> = { at: number; value: Promise<T> };
const g = globalThis as typeof globalThis & { __deskShared?: Map<string, Entry<unknown>> };
const memo = (g.__deskShared ??= new Map<string, Entry<unknown>>());

export function shared<T>(key: string, ttlMs: number, read: () => Promise<T>): Promise<T> {
  const hit = memo.get(key) as Entry<T> | undefined;
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const entry: Entry<T> = { at: Date.now(), value: read() };
  memo.set(key, entry);
  entry.value.catch(() => { if (memo.get(key) === entry) memo.delete(key); });
  return entry.value;
}

const BOARD_TTL_MS = 1000;

// Screens show a record's first history entry (when it was opened), its newest ones and a short
// timeline. The Brain appends an entry per corroborating post, so a busy road had 368 entries and
// history was 92% of a 450 KB board that every tab downloaded each second. Screens get the first
// entry plus the newest HISTORY_KEEP; the database and the agents keep the whole history.
const HISTORY_KEEP = 12;
function trimHistory<T>(rows: T[]): T[] {
  return rows.map((r) => {
    const h = (r as { history?: unknown[] }).history;
    if (!Array.isArray(h) || h.length <= HISTORY_KEEP + 1) return r;
    return { ...r, history: [h[0], ...h.slice(-HISTORY_KEEP)] };
  });
}

/** GET /api/board's body, encoded once per window and shared by the API and the pages. */
export function boardJson(desk: string): Promise<string> {
  return shared(`board-json:${desk}`, BOARD_TTL_MS, async () => {
    const b = await getBoard(desk);
    return JSON.stringify({
      ...b,
      sites: trimHistory(b.sites), needs: trimHistory(b.needs), roads: trimHistory(b.roads),
      shelters: trimHistory(b.shelters), zones: trimHistory(b.zones), incidents: trimHistory(b.incidents),
      tasks: trimHistory(b.tasks),
    });
  });
}

/** The desk's people (names for cards). They change rarely. */
export function sharedUsers(desk: string) {
  return shared(`users:${desk}`, 30_000, () => listUsers(desk));
}
