# Worker brief: Disaster Desk frontend

You are one worker on the frontend (Role 3) of Multiplayer Disaster Desk, a hackathon app (Next.js 15 App Router, Tailwind v4, TypeScript). An orchestrator session gave you one task. It reviews, merges and pushes your work. You only do the task.

## Read before you write code
- `docs/Multiplayer Disaster Desk/Roles/Frontend visual language.md`: the design rules. They are strict.
- `docs/Multiplayer Disaster Desk/Roles/Role 3 - Frontend.md`: what the screens must do.
- `lib/README.md` and `lib/types.ts`: the API and data shapes (Role 1 owns them).
- The components your task names. Reuse them before you write new ones.

## Hard rules
1. **Look:** USWDS tokens only. Colours, fonts and radii come from `app/globals.css` through `components/encode.ts`. Never write a hex value or a Tailwind palette colour (`bg-red-600`). No serif, no mono. Red means act now and nothing else, blue means clickable and nothing else.
2. **Copy:** plain English, sentence case. No em dashes, no semicolons, no `·` separators, no arrows, no progress dots, no emoji. Separate fields with commas and words.
3. **Data:** screens work against any API. Fetch through a small hook (see `components/map/usePolled.ts`), turn the response into what the screen draws with a pure adapter function, and fall back to `fixtures/` with a visible "Demo data" line when the endpoint does not answer. Never import `lib/db.ts` from a client component.
4. **Ownership:** you may edit `app/` pages, `components/`, `fixtures/`, `public/` (not `public/data/`). Do not touch `lib/`, `agents/`, `workers/`, `app/api/` or `package.json` unless the task says so. If you need something from those, write it in your report as a request.
5. **Scope:** only the files the task lists, plus new files it needs. No drive-by refactors.
6. **Never** run `next dev`, `next build` or `npm install`, and never push. A dev server already runs on the main checkout.

## Done means
1. `npx tsc --noEmit`, `npx eslint` and `npm run check:tokens` all pass in this worktree.
2. You committed on this branch with a message in this shape:
   ```
   <Area>: <what changed, in plain words>

   - <one line per change, why it matters>

   Co-Authored-By: Claude <noreply@anthropic.com>
   ```
3. Your last message is the report: what you built, files changed, what you could not check, and any request to another role. Short, plain, no hype.
