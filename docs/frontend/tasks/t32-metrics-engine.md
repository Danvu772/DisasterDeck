---
id: t32-metrics-engine
effort: high
checkpoint: metrics
files: new components/metrics/compute/*.ts, new components/metrics/registry.ts, new components/metrics/router.ts, new fixtures/metrics.ts
---
# Metrics engine: ten research metrics computed from the board

Read `docs/frontend/METRICS.md` (every metric, its source, its formula, what data exists) and `components/metrics/types.ts` (the contract, do not change it, ask in your report if you must). Another worker builds the charts against the same contract in parallel. Do not touch `components/metrics/charts/`.

## Build
- One pure file per metric in `components/metrics/compute/` (`slaT0.ts`, `freshness.ts`, `credibility.ts`, `shelters.ts`, `logistics.ts`, `coverage.ts`, `ics209.ts`, `lifelines.ts`, `agentFidelity.ts`, `triageOrder.ts`). Each exports `compute(input: MetricInput): MetricResult`. `MetricInput` (define it in `registry.ts`): `{ board, events?, users?, now }`, where `board` has the `Board` fields from `lib/types.ts` (fixture boards may lack `zones`, handle it) and `now` is the scenario clock from `components/clock.ts` (t31).
- Follow the formulas in METRICS.md exactly. Percentiles, never averages, for times (NFPA 1710). Admiralty: two axes in a 6 by 6 matrix, never merged into one score. Freshness: `0.5 ^ (age / halfLife)` with `halfLife` = `STALE_AFTER_MIN` per type from `encode.ts`.
- **Honesty:** when the data cannot support a number, return `status: "unknown"`, `chart: { kind: "none" }` and an `unknownReason` naming what is missing and who owns it ("Needs user positions from GET /api/users, Role 1, issue #2"). `agent_fidelity` and `triage_order` are unknown for the demo (they need scenario ground truth). `coverage` is unknown when `users` is missing, and computed when the fixtures pass users with coords.
- Every result carries `source` (name and URL from METRICS.md), a plain one-sentence `headline` with the number in it, and `basis` ("from 3 shelters, newest count 4 min ago").
- `recordKey` on points wherever a point is one record (`site:site-57`), so the chat can link it.
- `registry.ts`: `allMetrics(input)`, `metric(id, input)`, and per id a short list of plain-language triggers.
- `router.ts`: `metricsForQuestion(text: string): MetricId[]`, keyword matching on those triggers, English plus the obvious Turkish words (barınak, yol, kapasite), at most 2 ids, most specific first. "How full are the shelters?" gives `shelters`. "Which roads are closed?" gives `lifelines`. "How fresh is our data?" gives `freshness`. "Can we trust this?" gives `credibility`. "Status report" or "sitrep" gives `ics209`.
- `fixtures/metrics.ts`: `makeMetricInput(now)` built on `makeBoard`, with users that have coords, so every computable metric has data in demo mode.

Accept when: running every metric on the fixtures gives a sensible result (check it in a throwaway tsx script, then delete the script), the two ground-truth metrics say unknown with a reason, and the router maps the example questions above correctly.
