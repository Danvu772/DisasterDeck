---
id: t07-field-phone
effort: high
checkpoint: CP3
files: new app/field/page.tsx, new components/field/*
---
# Field team phone view

A phone-sized screen for a field team (Role 3 doc task 4, `What to borrow` A10 "pins first, details on tap"). It must work with one thumb, in the cold, on a bad network.

- `/field?user=<id>` (default `field-alpha`). Shows only this person's current task: the open task with the best tier, then priority, where `assignee` is the user. Huge title, the address, how many people, the case id. Details collapse behind a "Details" button.
- Buttons, full width, big: **On our way** (posts `answer` with `result: "accepted"` and `etaMinutes` picked from 10, 20, 30, 60), **Arrived** and **Done** (`answer` with `result: "done"` and a note). Follow `lib/schemas.ts` for the exact payloads.
- **Problem**, big and act-red (the only red button): four choices, Vehicle, Road blocked, Can't find it, Other. Posts `incident` with the task id, `canContinue: false`, and `coords` when the browser gives a position within 3 s.
- **Hold to talk:** hold a big button, MediaRecorder records, release sends `POST /api/chat?user=<id>` with `{ audioBase64, mimeType }`. Read `app/api/chat/route.ts` to see what it accepts today. If it does not take audio yet, keep the recording UI, say "Voice is not wired yet", and file the request to Role 2 in your report. Note: phones only give the mic to HTTPS pages.
- **Offline queue:** if a post fails because the network is down, keep it in `localStorage` (wrap every access in try/catch), show "2 reports waiting to send", and retry every 10 s. Give every queued post a `dedupeKey` so retries never double.
- Data: poll `GET /api/board` with `usePolled` from `components/map/usePolled.ts`, fall back to `makeBoard(now)` with the "Demo data" line.

Do not edit `components/TaskCard.tsx` or `components/AgentDesk.tsx` (another worker owns them this round). Build your own components under `components/field/`. The nav link already exists, do not edit `components/Nav.tsx`. Check the layout at 390 px wide.
