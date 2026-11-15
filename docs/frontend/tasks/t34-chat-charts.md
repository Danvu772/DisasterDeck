---
id: t34-chat-charts
effort: high
checkpoint: metrics
files: components/AskDesk.tsx, components/AgentDesk.tsx (chat column only), components/ChatLine.tsx, new components/metrics/ChatMetrics.tsx, new components/metrics/useMetrics.ts
---
# The chat answers with animated charts

Dan: "this is a feature that needs to work with chat. Chat needs to start animating the graphs." Read `docs/frontend/METRICS.md`, `components/metrics/types.ts`, `components/metrics/registry.ts` and `router.ts` (engine, t32), `components/metrics/charts/` (charts, t33, see `/lab` "Metric charts"), and `components/chatError.ts` (t35).

## Behaviour
- When a person asks in **Ask the desk** (board) or the **`/agent` chat**, pick up to 2 metrics: first from the reply's `actions` when the agent sends `{ type: "show_metric", id }` (issue #27, not built yet, accept it when present), otherwise `metricsForQuestion(text)` on the question.
- Show each chosen metric as a `MetricCard` directly under the agent's reply, in the conversation. The cards animate in (the charts already do this on mount).
- **Live:** while the card is on screen, recompute it from the polled board every poll (`useMetrics(ids)` hook: `metric(id, input)` with the live board from `usePolled("/api/board")`, events from the feed the screen already has, users when `/api/users` exists, `now` from `deskNow` in `components/clock.ts`). The charts tween only the values that changed, so the graph keeps moving as the desk changes. Fixtures (`makeMetricInput`) when the board API is not live, with the "Demo data" line.
- **Works without the agent:** when `/api/chat` fails (no `ANTHROPIC_API_KEY` today gives 502), still show the metric cards for the question, under the `chatErrorText` line. A question about shelters must show the shelter chart even when the agent is down.
- Only the newest answer's cards stay live. Older cards freeze at their last values (no work for the browser, no motion in history).
- A point with `recordKey` links to `/?open=<key>`, already in the charts.
- No metrics on the board itself (decision 2, no headline numbers). They live in the chat only.

Accept when: on `/` asking "how full are the shelters?" shows the shelter chart animating in under the reply (or under the 502 line), "which roads are closed?" shows lifelines, "sitrep" shows the ICS-209 snapshot, and the shelter chart moves when a shelter count on the board changes.
