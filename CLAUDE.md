## Agent skills

### Issue tracker

GitHub Issues on `Danvu772/DisasterDeck` (this fork), via the `gh` CLI. Pass `--repo Danvu772/DisasterDeck` or run `gh repo set-default Danvu772/DisasterDeck` once, because `gh` otherwise picks the upstream parent. See `docs/agents/issue-tracker.md`.

### Design and decisions

The design is `docs/SYSTEM_DESIGN.md`. Its glossary is §11. Decision records live in `docs/decisions/`, one per decision. There is no `docs/adr/` and no separate `GLOSSARY.md`. See `docs/agents/domain.md`.

A change to the design goes in its own `design/` PR (the design file plus a decision record) and merges before any code that depends on it. A code PR never quietly changes the design.

## Deployment

**Today:** production is the `prod` branch. Every push to `prod` deploys to the Vultr VM behind https://disasterdeck.us (`.github/workflows/deploy.yml`). Promote with `git push origin main:prod`, only when the person asks. One Brain per database, and the prod VM runs it. How it works, the rules and debugging: `docs/agents/deploy.md`.

**Being retired:** D-0002 moves hosting to AWS ECS Fargate. Don't extend the Vultr scripts.

## Owner and tracking

Dan (`Danvu772`) owns this fork and everything in it, and he is the only design voter. There are no role lanes.

- Every change is branch → PR → merge into `main`. Nobody commits to `main` directly.
- Tie each request to an issue number. If nothing matches and the work will take more than a few minutes, open an issue on the fork before you edit.
- `decision` issues are Dan's to make. Put the options in front of him and stop there.
- Never close an issue on Dan's behalf. Comment with what was done and let him close it.
