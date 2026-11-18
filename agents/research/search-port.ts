// The search port (D-0009). Everything that used to reach Claude's web_search tool now goes
// through this one interface, so a real search backend (Brave) can be slotted in later without
// touching the news agent or the help desk. The pilot provider is the official feeds only:
// no open-web search, no search-API call ships in this build (WS-1).

import { collect, FEED_KINDS, type FeedEvent, type FeedKind } from "./news-search";

export interface SearchRequest {
  /** Free-text intent. The official-feeds provider ignores it: feeds are pulled by channel. */
  q?: string;
  /** Restrict to entries that name this region. Empty = everything the feed returns. */
  region?: string;
  /** Which feeds to pull. Default: all three. */
  channels?: FeedKind[];
  /** The desk the events are for (dedupeKey scope). */
  deskId: string;
  /** true = read saved fixtures, so tests and demos run offline. */
  replay?: boolean;
}

export interface SearchProvider {
  readonly name: string;
  search(req: SearchRequest): Promise<FeedEvent[]>;
}

function regionOf(e: FeedEvent): string {
  const p = e.payload as { region?: string };
  return p.region ?? "";
}

/**
 * The pilot provider: official feeds only. One channel failing must not stop the others, and
 * the region filter is done here in code on the parsed entries, never sent to a search API.
 */
export function officialFeedsProvider(): SearchProvider {
  return {
    name: "official-feeds",
    async search(req) {
      const channels = req.channels ?? [...FEED_KINDS];
      const found: FeedEvent[] = [];
      for (const kind of channels) {
        try {
          found.push(...await collect(kind, { deskId: req.deskId, replay: req.replay }));
        } catch (err) {
          console.error(`[search:official-feeds] ${kind} failed: ${(err as Error).message}`);
        }
      }
      const region = req.region?.trim().toLowerCase();
      return region ? found.filter((e) => regionOf(e).toLowerCase().includes(region)) : found;
    },
  };
}

// D-0009, later: a Brave provider slots in here behind the same port when a real pilot needs
// breaking news. Not implemented on purpose, so the pilot build makes no search-API call (WS-1).
//
// export function braveProvider(apiKey: string): SearchProvider {
//   return { name: "brave", async search(req) { /* Brave Search API */ return []; } };
// }
