# D-0004 Identity: Cognito, no-login reports, Login.gov

- **Date:** 2026-11-17
- **Status:** accepted
- **Decided by:** Dan Vu (design owner). Ömer to sign off on `docs/SYSTEM_DESIGN.md`
- **Dissent:** none recorded

## Context
Login is Auth.js 5 beta with SSOJet over OIDC, and roles come from an email map in an env var. SSOJet has no government listing, and agencies want staff on their own logins.

## Decision
SSOJet is out. Agency staff log in through Amazon Cognito federated to their agency's Entra ID or Okta. Emergency reports need no login. The public can optionally use Login.gov. Keep Auth.js, pinned to a stable release. Roles move from env vars into the database.

## Consequences
The role request and approval flow (designed in v2, never built) gets built with this. No-login reports need rate limits and moderation. Invariant 7 holds: the actor still comes from the session.
