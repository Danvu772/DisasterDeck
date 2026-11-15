# Frontend decisions: v1 vs Ömer's v2 (14 Nov, 23:55)

Dan compared main (v1) with Ömer's `redesign/v2` branch (`/v2`, commit `4173fca`) and decided:

1. **v1 is the base.** Its workflows, routes, data adapters and every merged task (t01 to t24) stay. v2 is a reference for layout and aesthetics only.
2. **No v2-only features.** If v1 does not have the function, it does not come over: no headline numbers, no "why it is here" box, no shift handoff. A v2 restyle of a v1 function is fine (the queue health line becomes v2's status pill).
3. **v2's layout, USWDS values.** Every screen takes v2's composition, and every colour, font, radius and spacing comes from USWDS 3 tokens. No hand-picked hex.
4. **Dark USWDS header.** v2's bar (logo, "Disaster Deck", the exercise pill, role tabs, who is acting, queue health pill) on USWDS `base-darkest`, white text.
5. **Fonts: Public Sans + Roboto Mono** (both USWDS). Mono only for ids, times, scores and machine output, the way USWDS uses it. This replaces v3's "Source Sans, no mono".
6. **Board: v2 three-pane without the headline numbers.** List | map | detail side by side, desk feed below. The list shows v1's tabs as v2-style filter chips over one list, with v1's row content. The detail column is v1's detail panel.
7. **Coordinator, Field, Agent (volunteer), Map, Compare, Login** all get v2's layout or restyle, with every v1 function kept.
8. The `/v2` code is not merged. Workers read it from `origin/redesign/v2` (`git show origin/redesign/v2:<path>`). The `p-00x` proposal branches stay unmerged too (earlier decision).

Order: t25 (foundation: tokens, fonts, header) first, then t26 to t30 in parallel. t31 (scenario clock) fixes "counted 1373 days ago" on live data, a v1 bug the comparison exposed.

## Update, 15 Nov: `/v2` merged into main (Dan)

Dan asked to merge Ömer's `redesign/v2` into main. It now lives at `/v2` (board, coordinator, volunteer, field), next to the v1 screens, which stay the base and keep the v4 redesign. Point 8 above no longer holds for `/v2`.

- `/v2` keeps its own scoped theme (`app/v2/theme.css`, `.v2` only). The token guard skips folders named `v2` (`--exclude-dir=v2` in `check:tokens`), so its hex values do not fail the build. Everything outside `/v2` is still held to USWDS tokens.
- `/v2` draws its own header, so the main `Nav` returns nothing there.
- Open question for the demo: one look on screen. Either the demo stays on the v1 screens and `/v2` is not shown, or a later decision picks `/v2`.
