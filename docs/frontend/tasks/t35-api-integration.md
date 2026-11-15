---
id: t35-api-integration
effort: medium
checkpoint: integration
files: app/agent/page.tsx, components/AgentDesk.tsx, components/AskDesk.tsx, new components/chatError.ts, new docs/frontend/contract-check.mjs, package.json (one script line)
---
# The frontend reads everything the API offers, and a check keeps it that way

Checked against the live server and `/api/docs` on 15 Nov: the shapes match (board, feed, health, chat request and reply), and every event body the screens post passes validation (a missing task gives 404, never 400). What is left is on our side.

## 1. `/agent` desk feed reads `GET /api/events`
Today `app/agent/page.tsx` passes `makeEvents(now)` (fixtures) and `AgentDesk` never polls the feed. The board's `components/board/DeskFeed.tsx` already polls it, read how.
- Poll `GET /api/events?limit=30` with `usePolled`, then keep a `since` cursor (the newest `ts` you have) so later polls ask only for new events (the spec says: keep the `ts` of the last event and pass it as `since`). The spec returns oldest first. Show newest first, as now.
- Merge with the local events the buttons add (t29, Option B demo lines), dedupe by `_id`, and drop a local line once the server's copy of the same post arrives (match on `dedupeKey` when there is one).
- Fixtures stay the starting point until the first answer, with the "Demo data" line, as on every other screen.
- The feed report (t23, `?event=`) must keep working for API events.

## 2. Chat errors say what is wrong
`POST /api/chat` answers 502 `{ "error": "the agent failed this turn, try again" }` when the server has no `ANTHROPIC_API_KEY`, 401 without `DEMO_MODE`, 404 for an unknown user, 429 when rate limited. Today Ask the desk and the `/agent` chat show the raw text.
- One pure function `chatErrorText(status, body)` in `components/chatError.ts`, used by both. 502 and 500: "The desk agent did not answer. On this laptop the server may be missing ANTHROPIC_API_KEY (see .env.example)." 429: the server's words. Network failure: "The desk agent is not reachable." Keep it one plain sentence.
- `/agent` keeps its stub reply only when the route is unreachable, never to hide a 502.

## 3. A contract check
`docs/frontend/contract-check.mjs`, run with `npm run check:contract` against the running dev server (`BASE_URL`, default `http://localhost:3000`):
- GET `/api/board`, `/api/health`, `/api/events?limit=5`: status 200 and the top-level shape the screens read (board lists, health fields, array of events with `_id`, `ts`, `type`, `status`).
- POST `/api/events?user=<right role>` with every body the screens build (copy them from `taskEvents.ts`, `FieldPhone.tsx`, `ApprovalCard.tsx`) for a task id that does not exist: expect 404. A 400 means our body drifted from the schema, print the server's `issues`.
- POST `/api/chat?user=volunteer-callback` with `{ "text": "ping" }`: report 200, or name the cause for 502.
- Read-only on real data. It never posts to a real task id. Print one line per check and exit non-zero on a mismatch.
- Add `"check:contract": "node docs/frontend/contract-check.mjs"` to `package.json` scripts. Touch nothing else there.

Accept when: `/agent` shows the Brain's real "Örnek Sokak 12" report in its feed, a chat question on this laptop shows the ANTHROPIC_API_KEY sentence, and `npm run check:contract` passes except the chat line, which names the missing key.
