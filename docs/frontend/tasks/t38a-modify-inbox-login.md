---
id: t38a-modify-inbox-login
effort: medium
checkpoint: role1-takeover
files: components/coordinator/*, components/Nav.tsx, new components/InboxBadge.tsx, app/login/page.tsx
---
# Modify posts a real reassignment, the header shows the inbox, login hides the picker off this laptop (closes #3)

New on main: `GET /api/users`, `GET`/`POST /api/inbox` (t36, see `/api/docs`), the Brain applies an approval's `assignee` (t37), and demo identity works only from this laptop (t40, `lib/localDemo.ts`).

1. **Modify (#3):** the coordinator's person picker reads `GET /api/users` (fall back to `fixtures/desk.ts` users when it fails, with the demo line). Offer field teams for rescue tasks, volunteers for call tasks, suppliers for deliver tasks. Choosing a person and confirming posts `{ type: "approval", source: "person", payload: { taskId, approved: true, assignee } }`. Show the result like Approve does. Remove the "Modify is not wired to the API yet" note. Commit with `Closes #3`.
2. **Inbox badge (frontend t05):** `components/InboxBadge.tsx` polls `GET /api/inbox` every 5 s for the current person (session, or `?user=` locally), shows the unread count as a small pill next to "Acting as" in the header (mono digits, act red only when an unread item is `kind: "approval"` or `"incident"`, otherwise neutral). Clicking it opens a short dropdown of the unread items (message, age) with a "Mark all read" button that posts `POST /api/inbox {}`. Hidden when nobody is identified. Add it in `Nav.tsx` with one import and one element, change nothing else there.
3. **Login:** `app/login/page.tsx` shows the "Demo laptop? Continue without signing in" line whenever `DEMO_MODE=1`. Show it only when the request is local: read the request headers with `headers()` and use the same test as `lib/localDemo.ts` (import it, it is edge-safe). Through a tunnel the page shows only "Sign in with SSOJet".

Accept when: tsc, eslint, check:tokens pass, and `npm run check:contract` and `npm run security:check` still pass (the dev server serves main, so say in your report which you could not run).
