# Frontend task board

Sources: `Roles/Role 3 - Frontend.md`, `Related systems/08 Synthesis/What to borrow.md`, and what Dan queues. How this works: `README.md`.

## Running

| Task | Effort | What |
|---|---|---|
| [t06-coordinator](tasks/t06-coordinator.md) | high | `/coordinator`: approvals (Approve, Modify, Reject), escalations, problems |
| [t07-field-phone](tasks/t07-field-phone.md) | high | `/field`: one task, big buttons, Problem, hold to talk, offline queue |

## Next (queued)

| Task | Effort | Waits on |
|---|---|---|
| [t09-map-validation](tasks/t09-map-validation.md) | low | ready |
| t04 priority breakdown on click | medium | Role 1: the score parts per record, so the screen does not guess them |
| t05 inbox badge in the nav | medium | Role 1: `GET /api/inbox` |
| t10 after login, open the screen for that role | high | Dan: SSOJet app, `AUTH_SECRET`, `SSO_USER_MAP` in `.env.local` |
| t11 "Today vs. with the desk" split screen for the pitch | medium | t01 |
| t12 Ask the desk box on the board, through `/api/chat` | medium | t01 |
| t13 case IDs ("Site 57") on cards, replies and the phone | low | Role 1: a short id per record |
| t14 loop step on site cards ("Step 3 of 5: team approved") | medium | t01, t06 |

## Blocked on other roles

- **Role 1 (Darshal):** `GET /api/board`, `GET /api/inbox`, `GET /api/health` are still "Not yet" in `lib/README.md`. Every screen falls back to fixtures until then.
- **Dan:** add `DEMO_MODE=1` to `.env.local`. Without it every page redirects to `/login`, and nobody can check screens in the browser. SSOJet credentials for t10.

## Done

| Task | Merged |
|---|---|
| Repo skeleton, `/lab`, board tabs, `/agent` | before 20:00 |
| USWDS v3 look, SSOJet login (Auth.js) | `38074d6` |
| `/map`: sites, problems, NASA zones (unknown stays unknown) | `2943653` |
| [t03-site-card-truth](tasks/t03-site-card-truth.md): "4 posts from 1 person", "Automated, not yet seen by a person" | `49eac4d` |
| [t01-board-live](tasks/t01-board-live.md): `/` polls the board API | `3765df2` |
| [t02-task-buttons](tasks/t02-task-buttons.md): buttons post real events, Problem asks which kind | `28009e7` |
| [t08-map-roads-shelters](tasks/t08-map-roads-shelters.md): shelters and roads on `/map` | merged 21:16 |
