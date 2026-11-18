# D-0015 CI to AWS: GitHub Actions with OIDC

- **Date:** 2026-11-17
- **Status:** accepted
- **Decided by:** Dan Vu (owner, only voter)

## Context
Today the deploy workflow joins a Tailscale network and rsyncs to the Vultr VM, with secrets in a flat env file on the box.

## Decision
Keep GitHub Actions. Authenticate to AWS with OIDC, so no long-lived AWS keys exist. Every secret moves to AWS Secrets Manager. Delete the Tailscale, WARP and Vultr scripts once AWS serves the site. Deploy by tag from `main`.

## Consequences
`.github/workflows/deploy.yml` is rewritten with D-0002. Fork Actions must be enabled first.
