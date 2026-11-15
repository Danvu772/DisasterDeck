# Frontend task board

Sources: `Roles/Role 3 - Frontend.md`, `Related systems/08 Synthesis/What to borrow.md`, and what Dan queues. How this works: `README.md`.

## Running

| Task | Effort | What |
|---|---|---|
| [t25-v4-foundation](tasks/t25-v4-foundation.md) | high | visual language v4: USWDS values, Public Sans + Roboto Mono, dark header with the queue pill |

## Redesign, after t25 ([decisions](DECISIONS.md))

| Task | Effort | What |
|---|---|---|
| [t26-board-v4](tasks/t26-board-v4.md) | high | board as list, map and detail side by side, v1 tabs as chips |
| [t27-coordinator-v4](tasks/t27-coordinator-v4.md) | medium | v2 coordinator layout, v1 functions, no handoff |
| [t28-field-v4](tasks/t28-field-v4.md) | medium | v2 field phone layout, v1 functions |
| [t29-agent-v4](tasks/t29-agent-v4.md) | medium | v2 volunteer layout for `/agent` |
| [t30-restyle-rest](tasks/t30-restyle-rest.md) | medium | map, compare, login, lab in v4 styling |
| [t31-scenario-clock](tasks/t31-scenario-clock.md) | medium | ages from the scenario clock, not "1373 days ago" |

## Next (queued)

| Task | Effort | Waits on |
|---|---|---|
| t17 Modify on approvals posts a real change | medium | Role 1: an approval with another `assignee` |
| t18 hold to talk turns speech into text | medium | Role 2: does `/api/chat` take audio, or text from the browser? |
| t04 priority breakdown on click | medium | Role 1: the score parts per record, so the screen does not guess them |
| t05 inbox badge in the nav | medium | Role 1: `GET /api/inbox` |
| t10 after login, open the screen for that role | high | Dan: SSOJet app, `AUTH_SECRET`, `SSO_USER_MAP` in `.env.local` |
| t13 case IDs ("Site 57") on cards, replies and the phone | low | Role 1: a short id per record |

## Blocked on other roles

- **Role 1 (Darshal):** `GET /api/board`, `/api/health` and `/api/events?since=` are live (`76427c5`). Still missing: `GET /api/inbox`, the Brain running with replayed data, and the contract fields in `p-002-contract` (score parts, case numbers, approve with another assignee) that t04, t13 and t17 wait on. Also asked: `GET /api/users` (the coordinator's person picker), and a way to approve with a different person (Modify).
- **Role 2 (Ömer):** `/api/chat` answers audio with "can't listen yet". Speech-to-text on the server, or text from the browser?
- **Dan, SSOJet dashboard (t10):** the app is rejected as `invalid_client`. Register the callback `http://localhost:3000/api/auth/callback/ssojet`, enable authorization code with PKCE, copy the client id and secret from the same environment, turn on one connection, set `SSO_USER_MAP` in `.env.local`. `ANTHROPIC_API_KEY` in `.env.local`, or `/api/chat` throws and Ask the desk, `/agent` and hold to talk get no answer. (`DEMO_MODE=1` is set, 21:30.)

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
| [t15-nav-phone](tasks/t15-nav-phone.md): nav scrolls sideways on a phone | `c953b29` |
| [t16-fixtures-seed-ids](tasks/t16-fixtures-seed-ids.md): fixtures use the seed's people | `d0d5d61` |
| [t11-today-vs-desk](tasks/t11-today-vs-desk.md): `/compare` for the pitch | `bcad602` |
| [t20-compare-consistency](tasks/t20-compare-consistency.md): `/compare` agrees with itself | `04bdcf2` |
| [t12-ask-the-desk](tasks/t12-ask-the-desk.md): Ask the desk box | `4562601` |
| [t14-loop-step](tasks/t14-loop-step.md): "Step 4 of 5: team on site." | `7e0bdc3` |
| [t19-phone-polish](tasks/t19-phone-polish.md): legend collapses on a phone, "Acting as" on `/field` | `40ad010` |
| [t21-record-detail](tasks/t21-record-detail.md): card detail panel with map, one Incident sites tab | `ff2a002` |
| [t22-panel-push](tasks/t22-panel-push.md): the detail panel pushes the board aside | `250db0c` |
| [t23-feed-report](tasks/t23-feed-report.md): desk feed entries open a report | `fbf48d2` |
| [t24-field-task-list](tasks/t24-field-task-list.md): `/field` lists every task of the team | `865301d` |
