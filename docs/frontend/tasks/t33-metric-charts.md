---
id: t33-metric-charts
effort: medium
checkpoint: metrics
files: new components/metrics/charts/*.tsx, app/lab/page.tsx (one new section)
---
# Animated charts for metric results

Read `components/metrics/types.ts` (the `ChartSpec` you draw, do not change it), `docs/frontend/research/emergency-map-animation.md` (motion rules) and the v4 section of the visual language doc. Another worker writes the engine in parallel. Do not touch `components/metrics/compute/` or `registry.ts`.

## Build
- `components/metrics/charts/MetricCard.tsx`: draws one `MetricResult`: the title, the headline sentence, the chart, then `basis` muted and the source as a link ("Source: NFPA 1710"). For `status: "unknown"`, show the headline and the `unknownReason` and no chart. Status shows as a small tag (`ok`, `warn`, `act`, `unknown`) using the existing tag style.
- One component per chart kind: `Bars.tsx` (horizontal, label left, value right in mono, optional `max` shows used of total), `Gauge.tsx` (one bar against its max, the share in big mono digits), `Matrix.tsx` (the Admiralty 6 by 6 grid: rows A to F reliability, columns 1 to 6 credibility, cell shade from the count, the count in mono, axis titles in words), `Snapshot.tsx` (the ICS-209 table: label, value, tone).
- Plain SVG or divs. No chart library. Colours only through tokens: map `Tone` to classes in one small function in `charts/tone.ts` (act, urgent gold for warn, calm, ok green, primary, ink). Red stays act-now only.
- **Animation, the point of this task:** on mount, bars grow from 0 to their value and gauges fill, about 400 ms ease-out, staggered 40 ms per bar, numbers count up. When a new `MetricResult` arrives with different values (the board changes), bars tween from the old value to the new one, and only the changed bars move. Nothing animates when nothing changed. `prefers-reduced-motion`: no motion, the final state at once. Use CSS transitions on width or transform, not a JS animation loop.
- Accessibility: every chart has a text equivalent (a visually hidden table or `aria-label` with the numbers), and colour is never the only signal (the value is always written).
- Points with `recordKey` render the label as a link to `/?open=<recordKey>`.
- `/lab`: a "Metric charts" section showing every chart kind with hand-written sample `MetricResult`s (one per kind, plus one unknown), and a button "Change the numbers" that swaps in a second sample so the tween can be checked.

Accept when: `/lab` shows all kinds animating in, "Change the numbers" moves only the changed bars, and reduced motion shows final states instantly.
