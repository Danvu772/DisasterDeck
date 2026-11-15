---
id: t28-field-v4
effort: medium
checkpoint: redesign
files: app/field/page.tsx, components/field/FieldPhone.tsx (layout only)
---
# Field phone: v2 layout, v1 functions

Read `docs/frontend/DECISIONS.md` and the v4 section of `Frontend visual language.md` first (t25 set the tokens, fonts and header). Take the layout from v2 (`git show origin/redesign/v2:<path>`), keep every v1 function, add no v2-only feature (no headline numbers, no "why it is here", no shift handoff). Colours, fonts and radii only through tokens and `encode.ts`. Mono only for ids, times and scores. Do not edit `components/encode.ts`, `app/globals.css` or `components/Nav.tsx` (t25 owns them, ask in your report if you need a token).

Reference: `components/v2/FieldV2.tsx`. Take its composition at 390 px: the "Your next task" (or "Your next call") heading, the address-first task card, the big button stack, the "Your agent" section with hold to talk.

Keep every v1 function: On our way with ETA choices, Arrived, Done with a note, the red Problem button and its four kinds, the offline outbox line ("2 reports waiting to send"), hold to talk (`useHoldToTalk.ts`, do not edit it), "Acting as ... (demo)", and the t24 task list ("Your other tasks (n)", tap to switch, `?task=`). Do not edit `useOutbox.ts`, `useHoldToTalk.ts` or `pickTask.ts`.
