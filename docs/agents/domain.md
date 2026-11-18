# Design and domain docs

Before exploring the code for a change, read:

- **`docs/SYSTEM_DESIGN.md`**: the one design. Components, contracts, invariants, the target stack, open decisions, glossary (§11).
- **`docs/decisions/`**: one record per design decision. Read the ones that touch the area you're working in.

There is no `docs/adr/` and no `GLOSSARY.md`. Don't create them.

## Use the glossary's words

When you name a domain concept in an issue title, a test name or a proposal, use the term as `SYSTEM_DESIGN.md` §11 defines it. If the concept you need isn't there, either you're inventing language the project doesn't use or there's a real gap. Note the gap in your PR.

## Flag decision conflicts

If your work contradicts a record in `docs/decisions/`, say so in the PR instead of overriding it quietly:

> _Contradicts D-0003 (gpt-oss on OpenRouter), but worth reopening because…_

Reopening a decision means a `design/` PR with a new record that supersedes the old one.
