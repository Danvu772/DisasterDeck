---
id: t36-inbox-users-routes
effort: high
checkpoint: role1-takeover
files: new app/api/inbox/route.ts, new app/api/users/route.ts, lib/db.ts (new read functions only), lib/openapi.ts, lib/api-check.ts (new cases only)
---
# Role 1 routes: GET/POST /api/inbox and GET /api/users (closes #1, #2)

Dan took over Role 1's blocking items (tracker #26). This task may edit the Role 1 files listed above, nothing else of Role 1's. Build on Darshal's code, do not replace it: read `app/api/board/route.ts`, `app/api/events/route.ts`, `lib/auth.ts` (`resolveCaller`), `lib/db.ts` and `lib/openapi.ts` first and copy their patterns (gate, error shape `{ error, issues? }`, DEMO_MODE handling, masking).

Your gap session already wrote both routes on a branch that now conflicts with Darshal's board, events and health routes. Read them for the logic, port only inbox and users: `git show origin/p-001-read-routes:app/api/inbox/route.ts`, `git show origin/p-001-read-routes:app/api/users/route.ts`, plus the matching parts of `git show origin/p-001-read-routes:lib/db.ts` and `:lib/openapi.ts`. Decisions are in `api_front_back_gap/DECISIONS.md` (D2 who may read, D4 the people list) and `GAPS.md` (G-03, G-04).

## GET /api/inbox, POST /api/inbox (#1)
- GET: the caller's unread items (`InboxItem`), newest first, and it stamps the caller's `lastSeen`. The caller comes from `resolveCaller` (session, then `?user=` in demo mode). An agent key gets 400 (an inbox belongs to a person).
- POST `{ ids?: string[] }`: marks those ids read, or all of the caller's unread items when `ids` is missing. Only the caller's own items. Returns `{ read: n }`.

## GET /api/users (#2)
- Returns `_id`, `name`, `role`, `region`, `status`, `coords`, `lastSeen` for the desk's users. Never `profile` (it holds stock and notes).
- Citizens (`role: "public"`) get 403 (D4). Volunteers and up may read it. Agents with the key may read it.

## Both
- Entries in `lib/openapi.ts` so they show in `/api/docs`, same style as Darshal's.
- `lib/api-check.ts`: add cases for both routes, writing only to its throwaway desk as it does now.
- Run `npm run check:contract` and confirm nothing regressed.

Accept when: `/api/docs` lists both routes, `curl "localhost:3000/api/users?user=coordinator-duty"` returns the 9 seeded people without `profile`, `?user=public-demo` gets 403, and `GET /api/inbox?user=field-alpha` returns `[]` and stamps `lastSeen`. Commit with `Closes #1, closes #2` in the message.
