---
id: t29-agent-v4
effort: medium
checkpoint: redesign
files: app/agent/page.tsx, components/AgentDesk.tsx, components/EventRow.tsx, components/YourNeeds.tsx, components/ChatLine.tsx, components/event/EventReport.tsx
---
# Agent (volunteer) screen: v2 layout, v1 functions

Read `docs/frontend/DECISIONS.md` and the v4 section of `Frontend visual language.md` first (t25 set the tokens, fonts and header). Take the layout from v2 (`git show origin/redesign/v2:<path>`), keep every v1 function, add no v2-only feature (no headline numbers, no "why it is here", no shift handoff). Colours, fonts and radii only through tokens and `encode.ts`. Mono only for ids, times and scores. Do not edit `components/encode.ts`, `app/globals.css` or `components/Nav.tsx` (t25 owns them, ask in your report if you need a token).

Reference: `components/v2/VolunteerV2.tsx`. Take its composition for `/agent`.

Keep every v1 function: the "Demo. Talk as" person switcher, the desk feed with click-to-report (t23, `?event=`, Back to feed), the context file, the top task card with Accept, Decline, Done, Problem (t02), "Your needs" with proposed needs (1 of 3 requests), the chat with the agent (`/api/chat`) and its stub fallback. Agent lines and event ids in mono, people in Public Sans.
