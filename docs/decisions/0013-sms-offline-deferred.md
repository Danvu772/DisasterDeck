# D-0013 SMS and offline path: deferred

- **Date:** 2026-11-17
- **Status:** accepted
- **Decided by:** Dan Vu (owner, only voter)

## Context
People in a silent zone can't use the app. SMS through AWS End User Messaging or SNS needs 10DLC or short-code registration, which takes weeks. IPAWS needs a FEMA application and an alerting authority.

## Decision
Defer both. Start 10DLC registration only when a county signs on. IPAWS stays a roadmap item.

## Consequences
The known limit "no offline or SMS" stays in SYSTEM_DESIGN §9. A messaging port is reserved in §4.5 with no provider.
