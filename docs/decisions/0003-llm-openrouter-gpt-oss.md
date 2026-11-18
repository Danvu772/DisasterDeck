# D-0003 LLM: gpt-oss-120b on OpenRouter, no Claude

- **Date:** 2026-11-17
- **Status:** accepted
- **Decided by:** Dan Vu (owner, only voter)

## Context
Every agent calls Claude through `agents/shared/llm.ts`. Dan decided against Claude for the product and wants US-built models with US-only data routing.

## Decision
Model calls go through OpenRouter's US-only endpoint (Business plan) behind the existing `modelFor()` / `send()` adapter. gpt-oss-120b for chat and extraction, gpt-oss-20b for small jobs such as the chat digest. The same open model on Bedrock is the fallback if an agency requires everything inside AWS. Drop the Anthropic and OpenAI keys.

## Consequences
- About $0.04 in / $0.17 out per million tokens (stack review figure). Weaker than frontier models on hard multi-step agent work, so tool schemas and prompts need testing.
- Claude-only features stop working: the server-side `web_search` tool (news agent, help-desk lookup) and any Anthropic beta in `llm.ts`. Web search needs a new provider (SYSTEM_DESIGN §8).
- Invariant 3 holds: the model still never allocates work.
