---
id: t06-coordinator
effort: high
checkpoint: CP3
files: new app/coordinator/page.tsx, new components/coordinator/*. Read-only: components/TaskCard.tsx, components/RecordCard.tsx, components/BoardCards.tsx
---
# Coordinator screen

The coordinator approves risky work and watches problems. Read `Final system design.md` §5 (Approvals, Picking a person) and §6 (Help desk) in `docs/Multiplayer Disaster Desk/`, and the Role 3 doc task 4.

Build `/coordinator` with three areas that fit one laptop screen without scrolling for the main thing:

1. **Waiting for approval:** tasks with `status: "waiting_approval"`, oldest deadline first. Each card shows the task title and detail, the record it is about (its confidence word, sources count and age through `Stamp`), and how long it has waited. Over the deadline: act-now red bar and the words "Waiting too long". Buttons: **Approve** (primary), **Modify**, **Reject** (outline). Approve and Reject post `type: "approval"`, `source: "person"`, `payload: { taskId, approved }` to `POST /api/events?user=<id>`. Modify opens a short inline form to pick another person from the people list and posts nothing yet: show "Modify is not wired to the API yet" and file it as a request to Role 1 in your report.
2. **Nobody fits (escalated):** tasks with `status: "escalated"`. Show the `tried` list in words ("Tried: team-2, zeynep") and the last history reason.
3. **Problems:** open incidents, critical first. What happened (`textEn`, original `text` below in muted), what the desk already did (`actions`), status tag.

Data: poll `GET /api/board` with `usePolled` from `components/map/usePolled.ts` and fall back to `makeBoard(now)` from `fixtures/board.ts` with the "Demo data" line. Add one escalated task to the fixtures if you need it, in a new export so you do not edit the existing arrays (another worker is editing `fixtures/board.ts`).

Identity for the demo: `?user=` from the URL (default `coordinator-duty`). Show the result of each post on the card ("Approved, sent" or the server's error). Do not edit `components/TaskCard.tsx` (another worker owns it this round). The nav link already exists, do not edit `components/Nav.tsx`.
