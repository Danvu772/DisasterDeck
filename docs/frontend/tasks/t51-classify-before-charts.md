---
id: t51-classify-before-charts
effort: medium
checkpoint: metrics
files: components/metrics/router.ts, new components/metrics/intent.ts, components/agent/VizSpace.tsx, components/AgentDesk.tsx (send handler and chat column only), components/metrics/useMetrics.ts
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
