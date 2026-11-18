# D-0003 LLM: gpt-oss-120b on OpenRouter, no Claude

- **Date:** 2026-11-17
- **Status:** accepted
- **Decided by:** Dan Vu (owner, only voter)

## Context
Every agent calls Claude through `agents/shared/llm.ts`. Dan decided against Claude for the product and wants US-built models with US-only data routing.

## Decision
Model calls go through OpenRouter's US-only endpoint (Business plan) behind the existing `modelFor()` / `send()` adapter. gpt-oss-120b for chat and extraction, gpt-oss-20b for small jobs such as the chat digest. The same open model on Bedrock is the fallback if an agency requires everything inside AWS. Drop the Anthropic and OpenAI keys.

## Consequences
- Prices on OpenRouter's model pages (checked 18 Nov 2026, cheapest provider): gpt-oss-120b $0.03 in / $0.15 out per million tokens, gpt-oss-20b $0.018 / $0.09. US-region providers may cost more, and the Business plan adds a fee. The cost meter records OpenRouter's own `usage.cost`, so the budget follows the real price.
- The US endpoint is `https://us.openrouter.ai/api/v1`. In-region routing needs the Business or Enterprise plan and fails closed: if no US provider serves gpt-oss with tools and JSON schema output, requests error instead of leaving the region.
- Weaker than frontier models on hard multi-step agent work, so tool schemas and prompts need testing.
- gpt-oss reads text only, so photos sent to an agent no longer reach a model. Tracked as issue #22 (becomes D-0016).
- Claude-only features stop working: the server-side `web_search` tool (news agent, help-desk lookup) and any Anthropic beta in `llm.ts`. Web search needs a new provider (SYSTEM_DESIGN §8).
- Invariant 3 holds: the model still never allocates work.
