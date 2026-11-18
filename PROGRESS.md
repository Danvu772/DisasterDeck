# Progress

Current state, so any agent or person can pick up. The orchestrator updates this at the end of every session.

**Phase:** Build. Design locked (`docs/SYSTEM_DESIGN.md` v3.1 + D-0001 to D-0016). Build is cut into issues on the fork. Hackathon-era docs and role lanes gone.

## Merged (18 Nov)

- #8 Atlas cluster module (PR #27)
- #6 AWS infra as code (PR #29)
- #11 Mongo-backed checks in CI (PR #30)
- #23 live model check (PR #31)
- #10 official feeds + contact directory (PR #34)
- #17 USWDS coordinator (PR #35)
- #18 USWDS desk/map/ops (PR #40)
- #22 → D-0016 photos (option 2, vision model) — design PR #38

## Open work

Ready to build (unblocked):

- #39 vision model: describe photos into text behind the LLM port (D-0016, PHO-1) — PR #42 open, model id provisional `nvidia/nemotron-3.5-super-vl`, needs Dan's confirm + evaluator
- #12 identity (Cognito federation, no-login reports, roles in db) — was blocked on #6; staged in `.worktrees/12`, no owner yet
- #14 voice port (dictation, Transcribe, Polly) — was blocked on #6; in flight (uncommitted `agents/shared/voice/` in root worktree on `feat/39-vision-model`)
- #16 USWDS field phone + Talk — blocked on #15 (done) + #14 (open)

Blocked / needs Dan:

- #7 deploy to AWS with OIDC — unblocked by #4/#6, but needs the AWS account + ECR + OIDC role actually provisioned
- #13 audit log — blocked on #12
- #19 IU tabletop — blocked on #12, #16, #18 (18 done)
- #22 photos — decision locked (option 2); build is #39. Issue still OPEN on GitHub, close it.

## Done (history)

- 17 Nov: system design v3 + D-0001..D-0008; open calls decided D-0009..D-0015; requirements; issues cut.
- 18 Nov: #15 USWDS foundation; #9 model adapter (drop Anthropic); role lanes + hackathon docs swept; orchestrator-lane workflow (SKILL R6); D-0016 photos option 2.
