// The desk's clock. Live data can be stamped months before today (the Antakya scenario is February 2023),
// so ages are measured against scenario time: the newest observedAt on the last board, plus the
// real time since that board arrived. Fixtures are built relative to now and never feed this, so they
// keep reading against Date.now().

const LIVE_WINDOW_MS = 24 * 3600_000; // a board whose newest stamp is this recent is live, not a scenario

let newest = 0;    // ms, newest stamp on the last board that had any
let fetchedAt = 0; // ms, real time that board arrived

function newestStamp(x: unknown, best = 0): number {
  if (Array.isArray(x)) { for (const v of x) best = newestStamp(v, best); return best; }
  if (x && typeof x === "object") {
    for (const [k, v] of Object.entries(x)) {
      // Only observedAt (when a fact was true) sets scenario time. `ts` is when the desk received it,
      // which is real time tonight even for a 2023 replay, and would make every replayed fact look years old.
      if (k === "observedAt" && typeof v === "string") {
        const t = Date.parse(v);
        if (t > best) best = t;
      } else best = newestStamp(v, best);
    }
  }
  return best;
}

// Call with every JSON body the screens fetch. Bodies with no stamps leave the clock alone.
export function observeBoard(body: unknown, at = Date.now()): void {
  const t = newestStamp(body);
  if (!t) return;
  newest = t;
  fetchedAt = at;
}

// `now` is real time (what usePolled hands to screens). Returns scenario time.
export function deskNow(now = Date.now()): number {
  if (!newest || newest > fetchedAt - LIVE_WINDOW_MS) return now;
  return newest + Math.max(0, now - fetchedAt);
}
