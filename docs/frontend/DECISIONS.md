# Frontend decisions: v1 vs Ömer's v2 (14 Nov, 23:55)

Dan compared main (v1) with Ömer's `redesign/v2` branch (`/v2`, commit `4173fca`) and decided:

1. **v1 is the base.** Its workflows, routes, data adapters and every merged task (t01 to t24) stay. v2 is a reference for layout and aesthetics only.
2. **No v2-only features.** If v1 does not have the function, it does not come over: no headline numbers, no "why it is here" box, no shift handoff. A v2 restyle of a v1 function is fine (the queue health line becomes v2's status pill).
3. **v2's layout, USWDS values.** Every screen takes v2's composition, and every colour, font, radius and spacing comes from USWDS 3 tokens. No hand-picked hex.
4. **Dark USWDS header.** v2's bar (logo, "Disaster Desk", the exercise pill, role tabs, who is acting, queue health pill) on USWDS `base-darkest`, white text.
5. **Fonts: Public Sans + Roboto Mono** (both USWDS). Mono only for ids, times, scores and machine output, the way USWDS uses it. This replaces v3's "Source Sans, no mono".
6. **Board: v2 three-pane without the headline numbers.** List | map | detail side by side, desk feed below. The list shows v1's tabs as v2-style filter chips over one list, with v1's row content. The detail column is v1's detail panel.
7. **Coordinator, Field, Agent (volunteer), Map, Compare, Login** all get v2's layout or restyle, with every v1 function kept.
8. The `/v2` code is not merged. Workers read it from `origin/redesign/v2` (`git show origin/redesign/v2:<path>`). The `p-00x` proposal branches stay unmerged too (earlier decision).

Order: t25 (foundation: tokens, fonts, header) first, then t26 to t30 in parallel. t31 (scenario clock) fixes "counted 1373 days ago" on live data, a v1 bug the comparison exposed.
