---
id: t41-visualize-tool
effort: high
checkpoint: metrics
files: agents/personal/tools.ts, agents/personal/turn.ts (the actions line only), agents/personal/prompts.ts (one short paragraph), app/api/chat/route.ts (only if the response type needs the new optional fields), lib/openapi.ts (ChatResponse actions description only)
---
# A visualize_metric tool the agent calls for quantitative answers (closes #27)

Dan wants the personal agent to make a real tool call when a question is quantitative, and the `/agent` screen opens an animation space with the chart. This is Role 2's code (Ömer, active in `agents/` right now). Keep the diff small and in the places listed. Read `agents/personal/tools.ts` (`DEFS`, `runTool`, `run`), `turn.ts` (how tool calls become `actions`), `prompts.ts`, issue #27, and the metrics engine: `components/metrics/types.ts`, `registry.ts` (`metric(id, input)`, `METRIC_IDS`, `MetricInput`), `docs/frontend/METRICS.md`.

## Build
- New tool in `DEFS`: `visualize_metric`, input `{ metric: enum of METRIC_IDS, why: string }`. Description: call it whenever the person asks something quantitative about the desk (how many, how full, how fast, how fresh, how sure, how far, status report). At most 2 per turn. It shows a chart on the person's screen. Do not repeat the numbers it returns in long form, one sentence is enough.
- In `run()`: compute the metric server-side with the engine (`metric(id, input)` from `components/metrics/registry.ts`, it is pure TypeScript). Build `MetricInput` from the data the tool context already has (the board copy the turn loads, users if present, `now` from `components/clock.ts`). Return to the model a short grounded text: the headline, the basis, the source name, and the status (or the unknown reason). That keeps the agent's sentence true to the chart.
- The turn's `actions` entry for this tool carries two new optional fields: `{ tool: "visualize_metric", summary, ok, type: "show_metric", id: "<metric id>" }`. The frontend already reads `type: "show_metric"` and `id` (`components/metrics/useMetrics.ts`). Do not change other actions.
- `prompts.ts`: one short paragraph telling the agent when to call it. Plain words.
- `lib/openapi.ts`: mention the two optional fields in the ChatResponse actions description.
- Test without spending tokens: a throwaway tsx script that calls `runTool("visualize_metric", { metric: "shelters", why: "test" }, ctx)` with a fixture context and prints the outcome. Delete it after. Do not call the model.
- Comment on issue #27 when done so Ömer sees exactly what changed (files and lines).

Accept when: tsc, eslint, check:tokens pass, the throwaway call returns a grounded shelter headline and an action with `type: "show_metric", id: "shelters"`. Commit with `Closes #27`.
