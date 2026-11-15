# Frontend workflow: one orchestrator, many workers

## Background

Role 3 (Dan) runs the frontend through one Claude session, the **orchestrator**. Dan talks only to it. It turns each request into a task file, picks how much model the task deserves, and starts a **worker**: a headless `claude -p` in its own tmux session and its own git worktree. The worker builds the task and commits on its own branch. The orchestrator reviews the diff, runs the checks, merges into `main` and pushes. Workers never push.

```
Dan ── asks ──> orchestrator ── writes docs/frontend/tasks/<id>.md
                     │
                     ├── dd run <id> ──> tmux dd-<id>: claude -p (model by effort)
                     │                     in ../HACKTHENEST-orchestra/wt/<id>, branch fe/<id>
                     │                     every thought and tool call ──> stream.log
                     │
                     └── review diff ──> dd merge <id> ──> main ──> push ──> LOG.md
```

Why worktrees outside the repo: two workers never edit the same checkout, and `tsc`, `eslint` and the dev server's `.next` never see a worker's files. (Lesson learned the hard way. Two dev servers on one checkout wipe each other's `.next` and every page turns into a 500.)

## Watching it

| What | Command |
|---|---|
| Everything every worker thinks and does, one line each | `tmux attach -t dd`, window `stream` |
| The one dev server (localhost:3000) | `tmux attach -t dd`, window `dev` |
| One worker, full output | `tmux attach -t dd-<id>` |
| Who is running | `scripts/orchestra/dd ls` |
| Last lines of one worker without attaching | `scripts/orchestra/dd peek <id>` |

Inside tmux: `Ctrl-b w` lists every window of every session, `Ctrl-b d` detaches. The stream log lives at `../HACKTHENEST-orchestra/stream.log`, raw JSON per worker in `../HACKTHENEST-orchestra/logs/`.

**Only one dev server.** It runs in `dd:dev`. Do not also start the Claude Desktop "desk" preview (`.claude/launch.json` in the vault), it runs `npm run dev` in the same checkout.

## How much model a task gets

| Effort | Model | Use it for | Examples |
|---|---|---|---|
| `low` | haiku | One file, the change is fully described, no judgement | copy, a label, a fixture value, a muted line on a card |
| `medium` | sonnet | One screen or component from existing primitives, wiring one endpoint | board polling, task buttons, map layers |
| `high` | opus | New screens with state, several files, anything with a design decision, debugging | coordinator screen, field phone, login flow |
| (none) | orchestrator | Review, merge, commit, push, docs, decisions, anything touching another role's files | every merge |

A task file can override the model with `model:`. When unsure, go one level up: a redo costs more than the bigger model.

## Queueing work

Tell the orchestrator in plain words. It writes `docs/frontend/tasks/<id>.md`:

```
---
id: t10-something
effort: medium
checkpoint: CP3
files: the files this task may touch
---
# Title
What to build, what "done" looks like.
```

Then `dd run <id>`. Two tasks run at the same time only if their `files:` do not overlap. Otherwise the second waits in the backlog on `TASKS.md`.

Every worker gets `scripts/orchestra/brief.md` first: the design rules, ownership, the data rule (hook plus adapter plus fixture fallback, so any API plugs in), and what "done" means.

## Merging

`dd merge <id>` rebases the branch on `origin/main`, runs `tsc`, `eslint` and `check:tokens`, fast-forwards `main`, pushes, and deletes the worktree. The orchestrator reads the diff before that, and writes one entry in `LOG.md` per merge.

## Files

| File | What |
|---|---|
| `scripts/orchestra/dd` | the control script |
| `scripts/orchestra/brief.md` | what every worker reads first |
| `docs/frontend/TASKS.md` | the board: what is done, running, next, blocked |
| `docs/frontend/tasks/*.md` | one file per task |
| `docs/frontend/LOG.md` | what merged, when, and anything worth knowing |
