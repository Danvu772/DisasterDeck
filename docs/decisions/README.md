# Design decisions

One record per design decision, including dissent. A record merges in a `design/` PR together with the change to `docs/SYSTEM_DESIGN.md`, before any code that depends on it.

Dan decides alone. Template: `# D-NNNN Title`, then Date, Status (proposed, accepted, superseded by D-NNNN), Decided by, then Context, Decision, Consequences.

| Record | Decision | Status |
|---|---|---|
| [D-0001](0001-frontend-uswds.md) | Frontend on USWDS | accepted |
| [D-0002](0002-hosting-aws-fargate.md) | AWS ECS Fargate, GovCloud later | accepted |
| [D-0003](0003-llm-openrouter-gpt-oss.md) | No Claude: gpt-oss-120b on OpenRouter, US routing | accepted |
| [D-0004](0004-identity-cognito.md) | Cognito federated to agency IdPs, Login.gov optional | accepted |
| [D-0005](0005-voice-transcribe-polly-on-device.md) | Transcribe + Polly, on-device dictation only | accepted |
| [D-0006](0006-maps-maplibre-esri.md) | MapLibre with Esri basemaps, own OSM tiles as fallback | accepted |
| [D-0007](0007-database-mongodb-atlas.md) | Keep MongoDB on Atlas, Atlas for Government when needed | accepted |
| [D-0008](0008-license-agpl.md) | Open source under AGPL | accepted |
| [D-0009](0009-web-search-official-feeds.md) | Web search: official feeds only for now, Brave later behind a port | accepted |
| [D-0010](0010-queue-keep-polling.md) | Queue: keep polling MongoDB | accepted |
| [D-0011](0011-evacuation-planner-deferred.md) | Evacuation planner deferred | accepted |
| [D-0012](0012-photo-agent-deferred.md) | Photo agent deferred | superseded by D-0016 |
| [D-0013](0013-sms-offline-deferred.md) | SMS and offline path deferred | accepted |
| [D-0014](0014-observability-audit.md) | CloudTrail, CloudWatch, app audit log | accepted |
| [D-0015](0015-ci-github-oidc.md) | CI to AWS: GitHub Actions with OIDC, Secrets Manager | accepted |
| [D-0016](0016-photos-option2.md) | Photos: a vision model describes them into text (option 2) | accepted |
| [D-0017](0017-synthetic-sources-demo-scenario.md) | Inputs rebuilt from scratch: four synthetic sources (X, Instagram, Facebook, AP), one demo scenario, one player | proposed |
