# Progress

Current state, so any agent or person can pick up. The orchestrator updates this at the end of every session.

**Phase:** Build. The design is locked (`docs/SYSTEM_DESIGN.md` v3.1, decisions D-0001 to D-0015). The build is cut into issues on the fork, in dependency order. Hackathon-era docs and role lanes are gone (18 Nov).

## Open work

| Issue | What | Blocks / blocked by | Owner |
|---|---|---|---|
| #22 | Photos: gpt-oss is text-only, so photo reports no longer reach a model | Dan's decision (option 2, photo functionality now) | Dan |
| #23 | Live model check: LLM-1 network log + LLM-3b smoke on gpt-oss-120b | needs the OpenRouter key | |
| #6 | AWS infra as code (VPC, Fargate web + Brain, Secrets Manager, CloudTrail, alarms) | needs the AWS account | Dan |
| #8 | Atlas cluster behind one repository module | needs the Atlas cluster; work on `origin/feat/8-atlas-module` | Dan |
| #7 | Deploy from GitHub Actions with OIDC; retire Vultr | after #6 | |
| #10 | Official feeds + help-desk directory replace web search | | Dan |
| #11 | Mongo-backed checks in CI | | Dan |
| #12 | Identity: Cognito federation, no-login reports, roles in the database | after #6 | |
| #13 | App audit log | after #12 | |
| #14 | Voice port (on-device dictation, Transcribe, Polly) | after #6 | |
| #16 | USWDS field phone and Talk screens | after #15 + #14 | |
| #17 | USWDS coordinator screen | after #15 | Dan |
| #18 | USWDS desk board, map and ops room | after #15 | Dan |
| #19 | IU tabletop scenario end to end | after #10, #12, #16, #17, #18 | |

Parallel builders only on issues whose files don't overlap.

## Done

- 17 Nov: system design v3 and D-0001 to D-0008; the seven open calls decided (D-0009 to D-0015); design v3.1; requirement IDs for the whole build; issues cut.
- 18 Nov: #15 USWDS foundation (PR #24); #9 model adapter, drop Anthropic SDK (PR #21); role lanes and hackathon docs swept (PR #26, #28).
