---
id: t46-demo-page
effort: medium
checkpoint: pitch
files: new app/demo/page.tsx, new components/demo/*
---
# /demo: the presenter's screen, the story's progress live

The table demo is about 2 minutes, then questions, and judges come by more than once (Hacker Packet, MLH science-fair format). The presenter needs one screen that shows where the story is right now and links the four role screens.

- **Story track:** the loop the pitch tells, as six steps read live from `GET /api/board` and `GET /api/events` (poll with `usePolled`):
  1. A post arrives (a site exists from an `x` source).
  2. A volunteer is asked to call (an open `call` task with an assignee).
  3. The call confirms it (site `callStatus: verified`).
  4. The coordinator approves a team (a `rescue` task `assigned` or `accepted` after `waiting_approval`).
  5. The team arrives (site `team_on_site`, or task `progress: arrived`).
  6. Problem solved (site `closed`, or an incident `resolved`).

  Each step shows done or waiting, the record it is about (case number when present, linking `/?open=`), and the time it happened. The newest completed step gets one short highlight (motion rules: once, reduced motion respected).
- **Role links:** four big buttons that open the role screens in new tabs: Coordinator (`/coordinator`), Volunteer Zeynep (`/agent?user=volunteer-callback`), Field team (`/field?user=field-alpha`), Board (`/`).
- **Health:** the header status pill already shows the Brain and queue. Add the counts the story needs (sites, open tasks, open incidents).
- Plain, big type for a projector, v4 tokens, no hype words. Keep the city name out of the copy (issue #32 decides it). Read the desk name from the board or say "the desk".
- Fixtures when the board API is not live, with the "Demo data" line, so the page never looks broken.

Accept when: tsc, eslint and check:tokens pass, and on fixtures the track shows a sensible partial state.
