# D-0009 Web search: official feeds only for now

- **Date:** 2026-11-17
- **Status:** accepted
- **Decided by:** Dan Vu (owner, only voter)

## Context
D-0003 removes Claude, and with it the server-side web search the news agent and the help-desk lookup used. No web search vendor we looked at has a government listing. Brave Search API has its own index, SOC 2 Type II and zero data retention on enterprise plans. OpenRouter's web search tool sends queries to Exa.

## Decision
No open-web search for the IU tabletop. The news agent reads official feeds only: NWS, FEMA, USGS and the pilot agency's own announcements. The help-desk lookup becomes a fixed directory of tow, tire, fuel and pharmacy contacts kept per desk. Web search goes behind a search port, with Brave as the first provider when a real pilot needs breaking news.

## Consequences
`agents/research/news-search.ts` and the `web_search` tool in `agents/personal/tools.ts` are replaced. The `official` channel's idea survives as feed readers. No search vendor contract until a real pilot.
