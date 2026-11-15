---
id: t29-agent-v4
effort: medium
checkpoint: redesign
files: components/TaskCard.tsx, new components/taskState.ts, app/agent/page.tsx, components/AgentDesk.tsx, components/EventRow.tsx, components/YourNeeds.tsx, components/ChatLine.tsx, components/event/EventReport.tsx
---
# Agent (volunteer) screen: v2 layout, v1 functions

Read `docs/frontend/DECISIONS.md` and the v4 section of `Frontend visual language.md` first (t25 set the tokens, fonts and header). Take the layout from v2 (`git show origin/redesign/v2:<path>`), keep every v1 function, add no v2-only feature (no headline numbers, no "why it is here", no shift handoff). Colours, fonts and radii only through tokens and `encode.ts`. Mono only for ids, times and scores. Do not edit `components/encode.ts`, `app/globals.css` or `components/Nav.tsx` (t25 owns them, ask in your report if you need a token).

Reference: `components/v2/VolunteerV2.tsx`. Take its composition for `/agent`.

Keep every v1 function: the "Demo. Talk as" person switcher, the desk feed with click-to-report (t23, `?event=`, Back to feed), the context file, the top task card with Accept, Decline, Done, Problem (t02), "Your needs" with proposed needs (1 of 3 requests), the chat with the agent (`/api/chat`) and its stub fallback. Agent lines and event ids in mono, people in Public Sans.

## Also: task buttons lock, and demo tasks fake success (Dan chose option B, 00:30)
Bug from a teammate: every Accept click adds another "accepted" feed line, the card never changes, and `/api/events` answers 404 because fixture tasks like `task-1` are not in Atlas.

- **Lock after a click.** Once Accept, Decline or Done is pressed, every button on that card is disabled until the outcome is known. One click gives exactly one feed line.
- **The card shows the new state.** Keep a local status per task id: Accept makes the card read "Accepted" (status tag `accepted`) and Done becomes the primary button. Done makes it "Done" and the card moves out of "Your top task" (the next task takes its place). Decline does the same and shows "Declined". Problem keeps today's four choices and marks the card "Problem reported".
- **Real task or demo task.** A task is real when its id is on the live board (`/api/board` answered and lists it). `/agent` must poll the board like the other screens (`usePolled`), starting from the fixtures as now.
  - **Real task:** post to `/api/events` as now. Show "Sending" and keep the lock. On 200 the local state stands until the board's own status catches up, then the board wins. On 4xx, unlock, roll the local state back, show the server's words.
  - **Demo task** (fixture-only id, or the board API is not live): do not post. Apply the local state at once and show a small muted "Demo" tag next to the result, so the team knows nothing reached the desk. The feed line is marked the same way.
- Use one pure helper for this (`components/taskState.ts`: `isRealTask(id, liveBoard)`, `nextLocalStatus(action)`) so `/field` and `/coordinator` can reuse it later.
