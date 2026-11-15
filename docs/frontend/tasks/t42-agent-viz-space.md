---
id: t42-agent-viz-space
effort: high
checkpoint: metrics
files: components/AgentDesk.tsx (chat column and layout only), new components/agent/VizSpace.tsx, components/metrics/ChatMetrics.tsx, components/metrics/useMetrics.ts
---
# /agent: an animation space that opens when you prompt

Dan: "we need the agent page to pop up an animation space when we prompt it." Today (t34) metric cards sit inline under each reply. Read `components/AgentDesk.tsx`, `components/metrics/ChatMetrics.tsx`, `useMetrics.ts`, the charts in `components/metrics/charts/` (see `/lab`, "Metric charts"), `docs/frontend/research/emergency-map-animation.md` (motion rules) and the v4 section of the visual language doc.

## Behaviour
- **Opens on prompt.** The moment the person sends a message, a visualization space opens with motion: on a laptop it slides in beside the chat (a column that pushes the chat narrower, never covering it, as t22 did for the board panel), about 250 ms ease-out. On a phone it rises as a bottom sheet over the lower half. `prefers-reduced-motion`: it appears without movement.
- **While the agent thinks:** the space shows the question and a quiet working state ("Reading the desk") with one subtle bounded animation (for example a shimmer on placeholder bars, stopping when the answer arrives). No spinner loop longer than the wait.
- **When the answer arrives:** the charts the agent asked for through its `visualize_metric` tool (`actions` with `type: "show_metric"`, task t41) animate in, one card after another (staggered ~120 ms). With no tool call, fall back to `metricsForQuestion` on the question, as t34 does. With nothing quantitative, the space shows a one-line "Nothing to chart for this question" and closes itself after 2 s.
- **Live:** the newest charts keep updating from the board (`useMetrics`), tweening only changed values. A small "Live" tag with the board's age.
- **History:** each prompt that produced charts adds a row to a small strip at the top of the space ("Shelters, 01:42", "Roads, 01:44"). Clicking one brings those charts back (frozen at their values then, with "as of 01:42"). Only the newest is live.
- **Close:** a Close button and Escape. Closing keeps the history. The space reopens on the next prompt.
- Inline cards under replies (t34) go away on `/agent`, the space replaces them. Ask the desk on the board keeps its inline cards.
- When the agent is down (502), the space still opens with the fallback charts and the `chatErrorText` line.

Accept when: tsc, eslint, check:tokens pass, and the report describes how you checked the open, think, answer and close states (the dev server serves main, so you cannot load your branch in a browser).

## Dan, 01:40: text outputs stay in the box
The agent's written reply stays in the chat box, exactly where it is today, in full. The animation space shows **only** charts and their small labels (title, headline sentence, source, Live tag). It never repeats or moves the reply text. The question shown in the thinking state is a one-line echo, not a second chat. Errors (`chatErrorText`) stay in the chat box too. The space only says "Nothing to chart for this question" when it has no chart.
