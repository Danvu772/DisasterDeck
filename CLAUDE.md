@AGENTS.md

## Claude-specific

- Dan's workflow is the project skill `dans-agentic-workflow-engineering` (`.claude/skills/`). Load it when you orchestrate, build or evaluate an issue.
- `gh` on this fork defaults to the upstream parent. Pass `--repo Danvu772/DisasterDeck`, or run `gh repo set-default Danvu772/DisasterDeck` once per clone.
- Before exploring for a change, read `docs/SYSTEM_DESIGN.md` and the records in `docs/decisions/` that touch the area (`docs/agents/domain.md`). There is no `docs/adr/` and no `GLOSSARY.md`.
- Screens: load the `desk-design` skill before touching `app/` or `components/`. It describes the hackathon look, which D-0001 (USWDS) replaces. Follow D-0001 for anything new.

## Deployment

**Today:** production is the `prod` branch. Every push to `prod` deploys to the Vultr VM behind https://disasterdeck.us (`.github/workflows/deploy.yml`). Promote with `git push origin main:prod`, only when Dan asks. One Brain per database, and the prod VM runs it. Details and debugging: `docs/agents/deploy.md`.

**Being retired:** D-0002 moves hosting to AWS ECS Fargate. Don't extend the Vultr scripts.
