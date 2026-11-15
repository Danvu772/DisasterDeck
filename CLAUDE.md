## Agent skills

### Issue tracker

GitHub Issues on `DarshalShetty/HackTheNest26`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root, created lazily. See `docs/agents/domain.md`.

## Deployment

Production is the `prod` branch: every push to `prod` deploys to the Vultr VM behind https://disasterdeck.us (`.github/workflows/deploy.yml`). Promote with `git push origin main:prod`, only when the person asks. One Brain per database, and the prod VM runs it. How it works, the rules and debugging: `docs/agents/deploy.md`.

## Team tracking

Every session starts with the open task list, injected by the SessionStart hook (`scripts/team-tasks.mjs`). The shared tracker is GitHub Issues. Your role lane is in `docs/agents/team.md`.

- Tie each request to an issue number. If nothing matches and the work will take more than a few minutes, open an issue (`gh issue create`) and claim it before you edit.
- Claim before you start: `gh issue edit <n> --add-assignee @me`. Do not work on an issue claimed by someone else without asking them.
- Work your lane first (the `role:` label). Take unclaimed work from another lane only when the person asks, and say so.
- `decision` issues are not yours to make. Put the options in front of the person and stop there.
- Never mark an issue closed on someone's behalf. Comment with what was done and let them close it.
