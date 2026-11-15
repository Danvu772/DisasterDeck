# Decisions: what Role 3 settled, and what Role 1 will be asked

Settled by Dan (Role 3) on 14 Nov 2026 in a grill round. Each entry says what the decision commits the desk to, where it is implemented, and the questions Role 1 should expect. Gap ids refer to [GAPS.md](GAPS.md).

## D1. The 15 Nov bar: a replayed tweet becomes a site and a task

A replayed tweet becomes a site and a task, and a coordinator can approve it on `/coordinator`. This needs a real keeper and dispatcher, not a stub that marks events done.

Implemented in proposal P-003 (`p-003-keeper` branch). The keeper and dispatcher run as one loop for now. Team contracts §2 lists them as separate workers, and splitting them is a later change.

Role 1 will be asked: does the keeper run against the shared Atlas cluster in `.env.local`? Who starts it, and what happens when it crashes mid-event? P-003 answers the crash case with a lock timeout that returns stuck events to `pending`, and the loop has to be run on purpose. It does not run against the shared database in this review.

## D2. Who may read the board: signed-in or demo callers

`GET /api/board` accepts a session, a demo user (`?user=` with `DEMO_MODE=1`), or the agent key. Anyone else gets 401.

The agent key is my addition, not part of the answer. The scenario player already calls `GET /api/board` with `x-agent-key` (`workers/scenario-player.ts`), so a route that refused it would break the replay.

Implemented in P-001 (`p-001-read-routes` branch).

Role 1 will be asked: does a citizen (`public` role) count as "signed in"? As written, yes. Board rows include site addresses and incident text, so this is the first thing to decide. Dan's answer covers "signed in" in general, so I did not add a role check here.

## D3. Post text: numbers masked before storage, Turkish kept

Site posts store the original Turkish and the English, with phone numbers masked by `maskPhones()` from `agents/shared/privacy.ts`. The board shows the English line, with the Turkish in smaller type below it.

Implemented in P-003 (keeper writes the masked text) and P-002 (`Site.posts` in the contract, and `BoardCards` shows it).

**Gap in the answer.** The mask applies to the copy on the site. The raw event payload stays in the `events` collection, unmasked, because `postEvent()` stores what it is given. Nothing in this review reads `events` back to a screen yet, but the `/agent` feed (G-11) would. Dan should confirm one of two things before the feed is built: the feed masks on the way out, or the event is masked before it is stored.

Also: the regex in `privacy.ts` matches Turkish number formats only. A number written in words is not masked. Role 1 will be asked whether that is acceptable for the demo.

## D4. The people list: volunteers and up, not citizens

`GET /api/users` returns `_id`, `name`, `role`, `region` and `status` for every user. A caller with the `public` role gets 403. Agents and any other role get the list.

The `profile` field, with stock counts and notes, is never returned.

Implemented in P-001.

Role 1 will be asked: the answer says "volunteers and up", but the role list is `volunteer`, `field`, `supplier`, `shelter`, `coordinator`, `public`. Supplier and shelter are not obviously "up" from volunteer. P-001 treats every role except `public` as allowed. If that is wrong, it is a one-line change.

## D5. Tunnel: supervised runs only, with DEMO_MODE on

The phones get a tunnel only during supervised test runs, and `DEMO_MODE` stays on for the demo. The risk is limited to the windows the tunnel is open.

No code. This is a process rule, recorded in GAPS.md (S-01).

Role 1 will be asked: the `?user=` path works whenever `DEMO_MODE=1`, so anyone who reaches the server while it runs can act as a seeded user. The rule limits the time, not the access. Role 1 should say whether `?user=` should also be refused when the request arrives through a tunnel host.

## D6. SSO: `SSO_USER_MAP` is enough for the demo

No `email` field on `User` before the demo. `auth.ts` keeps the env map. G-12 stays open until after the demo.

No code. `auth.ts` changed on disk during this session (the `nonce` check). That change is Dan's, and this review did not touch it.

## D7. Arrived: the site moves to `team_on_site`

When a team taps Arrived, the task gets `progress: "arrived"`, and if the task is for a site, the site's status becomes `team_on_site`. "On our way" sets `progress: "en_route"` and changes nothing on the site.

Implemented across P-002 (`AnswerPayload.progress`, `FieldPhone` sends it, and the zod schema refuses `progress` unless `result` is `accepted`) and P-003 (the keeper applies it).

Role 1 will be asked: what happens to a site that is `team_on_site` when its task is later declined? P-003 reopens the site only if a replacement task is created for it, and that is a question the answer does not settle.

## D8. Scope: Role 1's code on proposal branches, not merged

Every change to a Role 1 file is on a proposal branch and waits for Role 1's approval. Nothing Role 1 owns is on `main`.

Branches: `p-001-read-routes`, `p-002-contract`, `p-003-keeper` (stacked on `p-002`). Each has its proposal file and the approval check run against it.

## Defaults I took without asking

- G-13: the `/api/health` route is kept. It is in P-001.
- D-02: `fixtures/` belongs to Role 3. It is in `owners.json`.
- D-03: `npm run api:check` refuses a non-local `MONGODB_URI` unless `ALLOW_SHARED_DB=1` is set. It is in P-001.
- M-01: the stale `requestedBy` comments are removed. This is on `main`.
- M-02: not done. The repo copy of the Role 1 doc lives under `docs/`, which Team contracts §2 gives to Role 4, not Role 1. Role 4 syncs it.
