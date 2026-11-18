# Progress

Current state, so any agent or person can pick up. The orchestrator updates this at the end of every session.

**Phase:** Build. The design is locked (`docs/SYSTEM_DESIGN.md` v3.1, decisions D-0001 to D-0015). The build is cut into issues on the fork, in dependency order.

## Waiting on Dan

- #4: turn on Actions and branch protection, delete merged branches. Agents can't change repo settings.
- #5: open the AWS account, create your Atlas cluster, get an OpenRouter key. #6, #8 and #12 wait on it.

## Build order (issues on the fork)

| Wave | Issues | Can start |
|---|---|---|
| 1 | #9 model adapter | Now (build on fixtures; live test needs #5) |
| 1 | #15 USWDS foundation, #11 Mongo checks in CI | After #4 |
| 1 | #6 AWS infrastructure, #8 Atlas cluster | After #5 |
| 2 | #10 official feeds, #7 deploy via OIDC, #12 identity, #14 voice | After #9, #4 + #6, #6, #6 |
| 3 | #13 audit log, #16 field + Talk, #17 coordinator, #18 desk + map + ops | After #12, #15 + #14, #15, #15 |
| 4 | #19 IU tabletop end to end | After #10, #12, #16, #17, #18 |

Parallel builders only on issues whose files don't overlap (#9 and #15 don't).

## Done

- 17 Nov: system design v3 and D-0001 to D-0008 (#2); Dan's workflow in the repo (#3); planning snapshot (#1).
- 17 Nov: the seven open calls decided as D-0009 to D-0015; design v3.1; requirement IDs for the whole build; issues cut.
