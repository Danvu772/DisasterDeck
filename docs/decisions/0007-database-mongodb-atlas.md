# D-0007 Database: keep MongoDB on Atlas

- **Date:** 2026-11-17
- **Status:** accepted
- **Decided by:** Dan Vu (owner, only voter)

## Context
The hackathon data lives on Darshal's Atlas cluster. The whole Brain, the queue and the one-writer rule are built on MongoDB.

## Decision
Keep MongoDB. Dan creates his own Atlas cluster with fresh keys. Move to Atlas for Government (FedRAMP Moderate) when an agency needs it. Keep a thin repository layer so DocumentDB stays a fallback.

## Consequences
No data-layer rewrite. Every hackathon secret is rotated. Confirm Atlas for Government's current FedRAMP level before any pitch.
