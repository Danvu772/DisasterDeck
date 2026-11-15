---
id: t01-board-live
effort: medium
checkpoint: CP1
files: app/page.tsx, components/BoardTabs.tsx, components/HealthLine.tsx, new components/LiveBoard.tsx
---
# The shared board reads the real API

The landing page `/` builds its board from `fixtures/board.ts` on the server. Make it live.

- A client component `components/LiveBoard.tsx` polls `GET /api/board` every second with `usePolled` from `components/map/usePolled.ts` (import it from there, do not move it). The page passes `makeBoard(now)` as the initial value.
- Until `/api/board` answers, show one muted line: "Demo data, the board API is not answering." Same wording as `/map`.
- The health line uses the `health` field of the board response (`Health` in `lib/types.ts`: `pending`, `oldestPendingSeconds`, `failed`, `lastLoopAt`). Show `failed` when it is above 0. Red only when the oldest event waits more than 30 s, as now.
- The people cards on `/` keep working (task and need counts come from the polled board).
- Dates arrive as ISO strings from JSON. Everything in `encode.ts` already accepts strings. Check the rest.

Accept when: `/` renders from fixtures with the demo line, and would render the API board unchanged when it answers.
