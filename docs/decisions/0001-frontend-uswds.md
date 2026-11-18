# D-0001 Frontend on USWDS

- **Date:** 2026-11-17
- **Status:** accepted
- **Decided by:** Dan Vu (owner, only voter)

## Context
Agencies buy tools that pass Section 508 and look like government software. The hackathon swapped Dan's original USWDS pick for shadcn/Radix with motion effects to win the demo.

## Decision
Rebuild the screens on USWDS with react-uswds (Trussworks). Keep Next.js and React. motion and liquid-gooey stay only behind the demo-mode flag. Run axe accessibility checks in CI.

## Consequences
Every component is rebuilt, screen by screen. One screen set replaces both v1 and `/v2` (closes upstream #34). Design tokens theme it so it isn't visually flat.
