@AGENTS.md

## Claude-specific

- Dan's workflow is the project skill `dans-agentic-workflow-engineering` (`.claude/skills/`). Load it when you orchestrate, build or evaluate an issue.
- `gh` on this fork defaults to the upstream parent. Pass `--repo Danvu772/DisasterDeck`, or run `gh repo set-default Danvu772/DisasterDeck` once per clone.
- Before exploring for a change, read `docs/SYSTEM_DESIGN.md` and the records in `docs/decisions/` that touch the area (`docs/agents/domain.md`). There is no `docs/adr/` and no `GLOSSARY.md`.
- Screens: load the `desk-design` skill before touching `src/app/` or `src/components/`. It describes the hackathon look, which D-0001 (USWDS) replaces. Follow D-0001 for anything new.

## Deployment

Production runs on ECS Fargate (D-0002). A version tag on `main` deploys: `git tag -a v1.2.3 -m "release v1.2.3" && git push origin v1.2.3`. The workflow (`.github/workflows/deploy.yml`) authenticates to AWS with GitHub OIDC, builds the image, pushes to ECR, and rolls out the web and Brain services; a failed `/login` health check rolls back via ECS's circuit breaker. Only tag when Dan asks. One Brain per database, and the Brain Fargate service runs it. Details and debugging: `docs/agents/deploy.md`.
