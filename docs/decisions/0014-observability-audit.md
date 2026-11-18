# D-0014 Observability and audit

- **Date:** 2026-11-17
- **Status:** accepted
- **Decided by:** Dan Vu (owner, only voter)

## Context
Today there are custom health scripts and `GET /api/health`. Agencies ask for audit trails on day one.

## Decision
CloudTrail for every AWS API action, CloudWatch for logs and alarms, and an app-level audit log in MongoDB recording who changed which case, when and why. Records already carry `history`; the audit log adds reads of personal data (who opened a full phone number) and admin actions.

## Consequences
Built with the AWS infrastructure (D-0002). The audit collection gets one writer: the API layer.
