# D-0002 Hosting on AWS ECS Fargate

- **Date:** 2026-11-17
- **Status:** accepted
- **Decided by:** Dan Vu (owner, only voter)

## Context
Production is one IPv6-only Vultr VM with Cloudflare WARP for IPv4 and a Cloudflare tunnel. A disaster tool can't have one point of failure, and agencies expect FedRAMP-authorized hosting.

## Decision
AWS commercial first: ECS Fargate across availability zones, everything in infrastructure as code (CDK or Terraform), so the same stack redeploys to GovCloud with no code change.

## Consequences
`deploy/vultr/`, WARP, Tailscale and the `prod`-branch rsync deploy are retired. The Brain becomes a Fargate service, still one per database (the lease stays). CI to AWS and secrets handling are an open decision (SYSTEM_DESIGN §8).
