---
id: t40-api-security
effort: high
checkpoint: security
files: lib/auth.ts, middleware.ts, app/api/chat/route.ts (the demo gate only), app/api/events/route.ts (rate limit only), new lib/security-check.ts, package.json (one script line)
---
# Real user security before anyone outside can reach the API (closes #11)

Dan: "we need actual user security before someone accesses our API and messes us up during the demo." Dan owns #11 now (tracker #26). This task may edit the files listed, nothing else of Role 1's or Role 2's. Do not touch `lib/openapi.ts`, `lib/api-check.ts` or `lib/db.ts` (another worker is editing them).

## The holes today
1. `DEMO_MODE=1` makes `?user=<id>` work for **any** request (`lib/auth.ts` `resolveCaller`, and the separate `demoAllowed()` in `app/api/chat/route.ts`). Anyone who reaches the server can act as the coordinator, approve rescues, or spend the Anthropic key through `/api/chat`.
2. `canReadDesk` (`lib/auth.ts`) opens the board and the event feed to everyone in demo mode.
3. `middleware.ts` skips the login for every page in demo mode.
4. The dev server listened on every interface, so the campus network could reach it. The orchestrator restarted it on 127.0.0.1 as a stopgap. A tunnel for the phone would open it again.
5. `POST /api/events` has no rate limit (`/api/chat` has a small one).

## The rule
**Demo identity (`?user=`, `body.userId`) and the open demo reads work only for requests from this machine.** Everything that comes through a network, a tunnel or a proxy must be signed in with SSOJet or carry the agent key.

## Build
- `lib/auth.ts`: one function `isLocalDemo(req): boolean`. True only when `DEMO_MODE=1` **and** the request's `Host` is `localhost`, `127.0.0.1` or `[::1]` (any port) **and** none of the proxy headers is present (`x-forwarded-for`, `x-forwarded-host`, `x-real-ip`, `cf-connecting-ip`, `forwarded`). Tunnels and proxies add those headers, so a tunnelled request is never local. Optional env `DEMO_TRUSTED_HOSTS` (comma list) to add a LAN host on purpose. Read the docstring of `getSessionUserId` and keep the session path first.
  - `resolveCaller`: `?user=` only when `isLocalDemo(req)`. Otherwise 401 "Sign in. Demo users work only on this laptop."
  - `canReadDesk`: open only when `isLocalDemo(req)`, otherwise a session or the agent key.
  - Agent key: when `AGENT_KEY` is set but shorter than 24 characters, refuse it (500 "AGENT_KEY is too short") so a guessable key cannot be used.
- `app/api/chat/route.ts`: replace `demoAllowed()` with `isLocalDemo(req)` from `lib/auth.ts`. Change nothing else in Role 2's route. Write one line in your report so Dan can tell Ömer.
- `middleware.ts`: the demo bypass only when the request is local (the same test, edge-safe: headers and host only, no database). Everyone else goes to `/login`. Keep `/login`, `/lab`, `/api/*` (routes check for themselves) and static files open as now. Note: middleware cannot import `lib/auth.ts` if that pulls in MongoDB. Put the header test in a tiny edge-safe file both can import, for example `lib/localDemo.ts`, and add it to your files.
- `app/api/events/route.ts`: an in-memory rate limit per caller (user id, or the agent), for example 60 posts a minute for a person, none for the agent key. Same style as the chat route's limit. 429 with the server's words.
- `lib/security-check.ts` and `"security:check": "tsx --env-file=.env.local lib/security-check.ts"` in `package.json`: against the running server (`BASE_URL`, default `http://127.0.0.1:3000`), assert that
  - `GET /api/board` with `x-forwarded-for: 1.2.3.4` and no session gives 401,
  - `POST /api/events?user=coordinator-duty` with `x-forwarded-for` gives 401,
  - `POST /api/chat?user=volunteer-callback` with `cf-connecting-ip` gives 401,
  - a page like `/coordinator` with `x-forwarded-for` redirects to `/login`,
  - the same requests without the proxy header still work locally (200, or 404 for a fake task),
  - an approval from `volunteer-callback` for a real task would be refused (403 or 404): check the role rule stays in place.
  It must not write to the real desk (`malatya-2023`): use fake task ids, as `npm run check:contract` does.

Accept when: `npm run security:check` passes against the dev server, `npm run check:contract` still passes, tsc and eslint pass. Commit with `Closes #11`.
