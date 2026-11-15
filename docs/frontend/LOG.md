# Frontend log

Newest first. One entry per merge, plus anything a teammate should know. Times are EST, Saturday 14 Nov.

### 22:00 SSO: two of three bugs fixed (`84dda40`)
1. `SSOJET_ISSUER_URL` was `https://api.ssojet.com/oidc`. That path has no discovery document (404), so Auth.js failed with "not a conform Authorization Server Metadata response". Fixed in `.env.local` to `https://api.ssojet.com/`, the issuer SSOJet's discovery declares.
2. Auth.js sent no `state`, and SSOJet answered "invalid_request, required parameters missing". Fixed in `auth.ts` with `checks: ["pkce", "state"]`.
3. Open: SSOJet now says `invalid_client`. The request is well formed, so SSOJet does not know this client id plus callback URL. Dan checks the SSOJet dashboard (steps in TASKS.md, t10).

### 21:45 t12, t14, t19, t20 merged, a mojibake fix
- **t12** Ask the desk box above the board tabs, posts to `/api/chat`. On this laptop the route throws `ANTHROPIC_API_KEY is not set`, so it shows the error. Needs the key in `.env.local`.
- **t14** site cards say where they are in the loop: "Step 1 of 5: reported." up to "Step 5 of 5: reported back." Text only, the visual language bans progress dots.
- **t19** the map legend folds behind a "Legend" button on a phone. `/field` says "Acting as field-alpha (demo)".
- **t20** `/compare` no longer says "Zeynep is calling" next to "Call status: not called".
- **Fix (`ec32582`):** t16 wrote the seed coordinator's name double-encoded ("Demo NÃ¶betÃ§i KoordinatÃ¶r"). Caught on a screenshot, not by any check. Turkish names need a look in the browser after every fixture change.
- **Queued t21 (opus):** Dan wants every board card to open all its metadata and pin it on a map.

### 21:35 t11, t15, t16 merged, Atlas, demo mode
- **t16** fixtures use the seeded people (`volunteer-callback`, `field-alpha`, `supplier-primary`, `coordinator-duty`) and region `malatya-merkez`. Before this, every screen would have lost its tasks the moment `/api/board` served real records. The seed has one field team, so the team that declined in the story is now `volunteer-mechanic`.
- **t15** the nav row scrolls sideways on a phone, "Malatya" and "Design lab" hide below `sm`.
- **t11** `/compare` for the pitch opening, checked at 1280 by 720: the 2023 sheet (five rows, nobody called, nobody on it) next to the desk (one site, "4 posts from 1 person", an owner). It contradicts itself in two places, that is t20.
- **Database:** `.env.local` points at Darshal's MongoDB Atlas cluster (ping ok, `events`, `inbox`, `tasks`, `shelters`, `users` exist). The credentials live only in `.env.local`, which git ignores. Button presses on demo screens now reach Atlas and come back 404 "no such task", correct until `/api/board` serves real tasks.
- **Demo mode:** Dan set `DEMO_MODE=1`, so every screen opens without SSOJet. The dev server needed a restart to see it.
- **Orchestra fix:** `dd merge` refused to fast-forward when main had an unpushed docs commit. It now pushes main first and rebases the worker onto it.

### 21:25 t06, t07, t09 merged (`7411dc7`, `ce98454`, `1030ef1`)
- **t06 `/coordinator`** (opus, $1.26, 2.7 min). Approvals sorted by deadline, red with "Waiting too long" when overdue. Approve, Modify, Reject. Modify picks a person but posts nothing yet (needs Role 1). Escalated tasks list who was tried. Open problems, critical first.
- **t07 `/field`** (opus, $1.57, 4 min). One task per screen, On our way (10, 20, 30, 60 min), Arrived, Done, red Problem. An offline outbox in `localStorage` with `dedupeKey`, retried every 10 s. Hold to talk records and posts audio, but `/api/chat` can't listen yet. Arrived posts `accepted` with ETA 0 and the note "Arrived", because the answer schema has no arrived value.
- **t09** Yeni Cami ring on `/map`: "Independent check: Yeni Cami collapsed, 6 Feb 2023 (DHA). ARIA overlay covers 98% of its 500 m cell." Hover only, so not on touch.

What the workers found: the fixture people (`zeynep`, `team-4`) are not the seed people (`volunteer-callback`, `field-alpha`), so every screen would lose its tasks the moment `/api/board` answers. That is t16. The nav overflows on a phone, that is t15.

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
