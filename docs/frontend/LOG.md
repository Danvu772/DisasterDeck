# Frontend log

Newest first. One entry per merge, plus anything a teammate should know. Times are EST, Saturday 14 Nov.

### 21:20 t01, t02, t08 merged (`3765df2`, `28009e7`, and the map commit)
- **t01** `/` polls `GET /api/board` through `LiveBoard`, says "Demo data" until the route answers. The health line shows failed events when there are any.
- **t02** Accept, Decline, Done, Problem post real events to `POST /api/events?user=`. Problem asks which kind first (Vehicle, Road blocked, Can't find it, Other) and adds the browser position when it gets one within 3 s. The card says "Sent" or the server's own error. When the desk is offline, the screen still updates locally and says so.
- **t08** `/map` has shelters (square, gold when full or over 90%) and roads (a bar, thick when closed, dashed when unconfirmed, never red). Open roads are not drawn.

Not checked in the browser: since the SSOJet commit, every page needs a login unless `.env.local` has `DEMO_MODE=1`, and it doesn't. Dan sets that, the orchestrator is not allowed to switch off a login gate.

### 21:15 Orchestra set up
One orchestrator session, workers in tmux, see `README.md`. First worker run (t03, haiku): 18 s, one cent, clean diff.

The dev server kept dying with "Cannot find module './611.js'". Cause: two `next dev` processes on one checkout. One was ours, the other was the Claude Desktop "desk" preview from the vault's `.claude/launch.json`. Each start wipes `.next` under the other. Fix: one dev server, in `dd:dev`.

### 21:12 t03 site card truth (`49eac4d`)
Site cards say "4 posts from 1 person" and "Automated, not yet seen by a person." when nobody on the desk has touched them. Answers "isn't this afetharita?" (they deleted duplicates) and "how do you stop misinformation?" (Watch Duty labels automated facts).

### 21:05 Map (`2943653`)
`/map` in the USGS Latest Earthquakes layout. Sites, field problems, NASA zones. Both demo zones show the cold hatch (POWER says −14.38 °C) and a dashed "not evaluated" outline, because Role 4's damage and night-light values are `null` (saturated rendering, unresolved validity). Showing that honestly is part of the NASA checklist. Polls `GET /api/board`, fixtures until it exists.

### 21:05 USWDS v3 and SSOJet login (`38074d6`)
Committed from another session's work: USWDS tokens, Source Sans only, Auth.js with SSOJet as an OIDC provider, `/login`, middleware that gates pages unless `DEMO_MODE=1`. Touches Role 1's `lib/auth.ts` (the `getSessionUserId()` hook it left for us) and Role 2's `/api/chat` (session first, `?user=` fallback).
