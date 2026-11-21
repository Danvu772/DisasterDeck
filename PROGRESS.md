# Progress

Current state, so any agent or person can pick up. The orchestrator updates this at the end of every session.

**Phase:** Build. Design locked (`docs/SYSTEM_DESIGN.md` v3.1 + D-0001 to D-0016). Build cut into issues on the fork. Hackathon-era docs and role lanes gone.

## Session state (18 Nov, end of orchestrator session)

Two green PRs are open, unmerged, waiting on merge/review:

- **PR #42** — #39 vision model (D-0016 option 2): `vision` purpose behind `modelFor()`; `describeImage()` sends a photo to `nvidia/nemotron-3.5-super-vl` and feeds the text description to the text-only chat model. Tests 41/41.
- **PR #43** — #14 voice port: voice port abstraction (`agents/shared/voice/`) with AWS Transcribe + Polly default, ElevenLabs as fallback, on-device dictation `processLocally: true`. 9 new tests wired into CI.

Both carry the same UNKNOWN: the live half (real Transcribe/Polly call, real vision endpoint + price) is unverified until AWS is provisioned + wired (#7).

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

- #16 USWDS field phone + Talk — blocked on #15 (done) + #14 (PR #43 open)

Blocked / needs Dan:

- #7 deploy to AWS with OIDC — needs the AWS account + ECR + OIDC role actually provisioned (unblocks #12, and the live-halves of VOX/vision)
- #12 identity (Cognito federation) — unblocked by #6, but is AWS-account + hands-on
- #13 audit log — blocked on #12
- #19 IU tabletop — blocked on #12, #16
- #39 vision model — code done (PR #42); live model id + price still provisional
- #14 voice port — code done (PR #43); live Transcribe/Polly unverified

## Done (history)

- 17 Nov: system design v3 + D-0001..D-0008; open calls decided D-0009..D-0015; requirements; issues cut.
- 18 Nov: #15 USWDS foundation; #9 model adapter (drop Anthropic); role lanes + hackathon docs swept; orchestrator-lane workflow (SKILL R6); D-0016 photos option 2; vision model + voice port built.