# D-0010 Queue: keep polling MongoDB

- **Date:** 2026-11-17
- **Status:** accepted
- **Decided by:** Dan Vu (owner, only voter)

## Context
The Brain takes events with an atomic `findOneAndUpdate` on `pending`, and screens poll `GET /api/board` about once a second. Options were to keep that, move to Atlas change streams, or add a broker such as SQS.

## Decision
Keep polling for the pilot. Move to Atlas change streams when load needs it. No new vendor. The queue keeps its Kafka-like shape (one events topic, one inbox per person), so a broker can replace it later without a design change.

## Consequences
Nothing to build now. One Brain per database stays (lease in `meta`). Revisit when a desk handles more than a few hundred events an hour.
