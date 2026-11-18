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
