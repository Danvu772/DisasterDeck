---
id: t02-task-buttons
effort: medium
checkpoint: CP1
files: components/AgentDesk.tsx, components/TaskCard.tsx
---
# Task buttons post real events

`POST /api/events` is built (see `lib/README.md` §3, "A task button in demo mode"). The buttons in `components/AgentDesk.tsx` still use a stub (search for the TODO).

- Accept, Decline, Done post `type: "answer"`, `source: "person"`, `payload: { taskId, result }`. Problem posts `type: "incident"` with `kind`, `text`, `textEn`, `taskId`, `canContinue: false`.
- Problem opens four choices first: Vehicle, Road blocked, Can't find it, Other (`vehicle_breakdown`, `road_blocked`, `cannot_find`, `other`). Add the browser position as `coords` when `navigator.geolocation` gives one within 3 s, without it otherwise.
- Demo identity: `?user=<id>` on the URL, as `/api/chat` does today. A logged-in session also works, the server decides.
- Show the result on the card in plain words: "Sent", or the server's error text for 400/403/404. Never fail silently. Keep the local optimistic state so the demo works when the API is down, and say "Not sent, the desk is offline" in that case.
- Accept is the primary button until accepted, then Done is primary (visual language, Patterns table).

Accept when: each button sends the payload shape from `lib/schemas.ts` (read it), and errors show on the card.
