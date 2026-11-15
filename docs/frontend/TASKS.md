# Frontend task board

Sources: `Roles/Role 3 - Frontend.md`, `Related systems/08 Synthesis/What to borrow.md`, and what Dan queues. How this works: `README.md`.

## Running

| Task | Effort | What |
|---|---|---|
| [t15-nav-phone](tasks/t15-nav-phone.md) | low | the top bar fits a 390 px phone |
| [t16-fixtures-seed-ids](tasks/t16-fixtures-seed-ids.md) | medium | fixtures use the seed's people (`field-alpha`, not `team-4`) so screens survive real data |
| [t11-today-vs-desk](tasks/t11-today-vs-desk.md) | medium | `/compare`: the 2023 spreadsheet next to the desk, same five tweets |

## Next (queued)

| Task | Effort | Waits on |
|---|---|---|
| [t12-ask-the-desk](tasks/t12-ask-the-desk.md) | medium | t16 (ids) |
| [t14-loop-step](tasks/t14-loop-step.md) | medium | t16 (ids) |
| t17 Modify on approvals posts a real change | medium | Role 1: an approval with another `assignee` |
| t18 hold to talk turns speech into text | medium | Role 2: does `/api/chat` take audio, or text from the browser? |
| t04 priority breakdown on click | medium | Role 1: the score parts per record, so the screen does not guess them |
| t05 inbox badge in the nav | medium | Role 1: `GET /api/inbox` |
| t10 after login, open the screen for that role | high | Dan: SSOJet app, `AUTH_SECRET`, `SSO_USER_MAP` in `.env.local` |
| t13 case IDs ("Site 57") on cards, replies and the phone | low | Role 1: a short id per record |

## Blocked on other roles

- **Role 1 (Darshal):** `GET /api/board`, `GET /api/inbox`, `GET /api/health` are still "Not yet" in `lib/README.md`. Every screen falls back to fixtures until then. Also asked: `GET /api/users` (the coordinator's person picker), and a way to approve with a different person (Modify).
- **Role 2 (Ömer):** `/api/chat` answers audio with "can't listen yet". Speech-to-text on the server, or text from the browser?
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
| [t09-map-validation](tasks/t09-map-validation.md): Yeni Cami independent check on `/map` | `1030ef1` |
| [t06-coordinator](tasks/t06-coordinator.md): `/coordinator` | `7411dc7` |
| [t07-field-phone](tasks/t07-field-phone.md): `/field` | `ce98454` |
