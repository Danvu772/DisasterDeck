---
id: t51-classify-before-charts
effort: high
checkpoint: metrics
files: components/metrics/router.ts, new components/metrics/intent.ts, new components/metrics/MapCard.tsx, components/agent/VizSpace.tsx, components/AgentDesk.tsx (send handler and chat column only), components/metrics/useMetrics.ts
---
# Open the chart space only for quantitative asks

Dan: "before opening the charts animation, check if the request falls under the visual type of request." Read `docs/frontend/VIZ-MODALITIES.md` (the twelve intents, and what is not quantitative). Today `/agent` (t42) opens the space on every prompt, shows "Reading the desk", and closes with "Nothing to chart" when nothing fits.

## Build
- `components/metrics/intent.ts`: pure `classifyAsk(text): { quantitative: boolean; intent?: Intent; metrics: MetricId[] }`. Intent keywords per the doc's twelve intents, English and the obvious Turkish (kaç, ne kadar, dolu, en yakın, kapalı, durum...). Questions that are instructions, reports, needs, greetings or navigation ("pull the map", "I need 20 blankets", "tell Mehmet") are `quantitative: false`. `metrics` reuses `metricsForQuestion` from `router.ts` for the intents that have a metric today. An intent with no metric yet (trend, priority, progress, compare, amount) is still quantitative, with `metrics: []`.
- **On send:** run `classifyAsk`. Quantitative with at least one metric: open the space at once (as now) with the thinking state. Not quantitative: do not open. Quantitative with no metric: do not open (say nothing extra, the text answer covers it).
- **Late open:** if the space stayed shut but the agent's reply has `actions` with `type: "show_metric"`, open it when the reply arrives, straight to the charts (no thinking state). The agent saw the live data, it may overrule the keywords.
- Remove the "Nothing to chart for this question" state and the 2 s auto-close.
- Fix the duplicate history chip: asking the same metric again within a minute updates the existing chip instead of adding a second "Shelters, 02:32".
- Ask the desk on the board (inline cards, t34) uses the same `classifyAsk` so both behave the same.

## Check
A throwaway tsx script over these and the expected result, delete it after: "How full are the shelters?" (capacity, shelters), "which roads are closed" (status, lifelines), "sitrep" (status, ics209), "can we trust the Kale report" (trust, credibility), "is it getting worse" (trend, no metric, no open), "pull map" (not quantitative), "I need 20 blankets" (not quantitative), "Barınaklar dolu mu?" (capacity, shelters), "hello" (not quantitative).

Accept when: the script matches, tsc, eslint and check:tokens pass.

## Also: the map modality (Dan, 02:45). This task is now high effort.
Dan: "I need map modality. When I ask geographical locations I need you to handle all of those and point it on maps. 'give me location of all shelters'."

- **A 13th intent, `location`:** where, location, locate, map, address, near, nearest, closest, show me on the map, Turkish nerede, konum, en yakın, harita. It is quantitative-adjacent: it opens the space, with a **map card** instead of a chart.
- `classifyAsk` returns, for a location ask, a **map query**: `{ kinds: ("site"|"shelter"|"road"|"need"|"incident"|"task")[]; filter?: { text?: string; region?: string; status?: string }; near?: "me" | LatLng }`. "location of all shelters" gives kinds [shelter]. "where is Örnek St. 12" gives kinds [site], text "Örnek St. 12". "closed roads near Kale" gives kinds [road], status closed, text "Kale". "nearest shelter" gives kinds [shelter], near "me" (the person's `coords` from the context file or the browser position, else drop `near`). Plurals and Turkish names map to kinds (barınak, yol, enkaz).
- **`MapCard`** (`components/metrics/MapCard.tsx`): a small Leaflet map (client only, `next/dynamic` with `ssr: false`) with the records that match, drawn with `components/map/markers.ts` so they look exactly like `/map`, the basemap from `components/map/basemap.tsx` (satellite by default), fitted to show every match (one match: zoom 16 on it). With `near`, a dashed line from the person to the nearest match and its distance in mono. Under the map, a short list: each match with its name, a one-line state (beds free, closed or open, people trapped) and a link to `/?open=<kind>:<id>`. "Open on the full map" links to `/map?focus=<first match>`. Zero matches: say so in one line and show the person's area. Records without coordinates are listed under the map as "No location yet", never guessed.
- **Live:** the map card follows the polled board like the charts do, markers update in place.
- **Agent action:** the reply may carry `{ type: "show_map", kinds, ids?, text? }` (task t52 adds the agent tool). Handle it like `show_metric`: late open straight to the map card.
- History chips work for map cards too ("Shelters on map, 02:45").
- Extend the check script: "give me location of all shelters" (location, kinds [shelter]), "where is Örnek St. 12" (location, site, text), "nearest shelter" (location, near me), "show closed roads on the map" (location, road, closed), "harita barınaklar" (location, shelter).

## Change (Dan, 02:50): the stage lives below the chat box
"Animation for quantitative metrics should open below the chatbox. That space becomes the animation stage. But only activate it when first queried."

- **Placement:** the chart and map space is no longer a column beside the chat (t42's slide-in from the right, and the bottom sheet on phones). It is a stage **directly below the chat box** (under the message input), the full width of the chat column. On a phone it sits under the chat input too, no sheet.
- **Activation:** nothing is rendered there until the first ask that `classifyAsk` (or an agent `show_metric` / `show_map` action) marks for the stage. That first time, the stage opens with motion (it grows open downward, about 250 ms ease-out, reduced motion: appears at once) and the page scrolls just enough to show it.
- **After that it stays:** the stage remains open as the place where every later chart or map card animates in. Asks that are not quantitative and not location leave it as it is (the last cards stay, frozen at their values). Close collapses it, and the next qualifying ask opens it again.
- The chat column keeps its full width at all times (the old "chat gets narrower" behaviour goes away). The text answer stays in the chat box, as before.
- History chips sit at the top of the stage.
