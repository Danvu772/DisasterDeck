---
id: t27-coordinator-v4
effort: medium
checkpoint: redesign
files: app/coordinator/page.tsx, components/coordinator/*
---
# Coordinator: v2 layout, v1 functions

Read `docs/frontend/DECISIONS.md` and the v4 section of `Frontend visual language.md` first (t25 set the tokens, fonts and header). Take the layout from v2 (`git show origin/redesign/v2:<path>`), keep every v1 function, add no v2-only feature (no headline numbers, no "why it is here", no shift handoff). Colours, fonts and radii only through tokens and `encode.ts`. Mono only for ids, times and scores. Do not edit `components/encode.ts`, `app/globals.css` or `components/Nav.tsx` (t25 owns them, ask in your report if you need a token).

Reference: `components/v2/CoordinatorV2.tsx`. Take its composition: a "Waiting for your decision" column with the line "Rules propose. You decide. Every answer goes into the record history.", a "Handed out without you" section for low-risk work, and a right sidebar "Problems in the field". **Drop the shift handoff panel** (not a v1 function).

Keep every v1 function from t06: Approve (primary), Modify (person picker, "not wired yet" note), Reject, the posted-result line, overdue red with "Waiting too long", the escalated section with the tried list (place it in the main column under the decisions, v2 style), open problems critical first with actions taken. Card style, pills and badges from v4.
