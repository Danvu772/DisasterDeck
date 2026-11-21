# Live model check (issue #23): gpt-oss-120b on the US endpoint

Ran 2026-11-18 against the real OpenRouter key from Secrets Manager. This is the live half of LLM-1 and LLM-3b that was blocked on #5.

Commands, all with `--env-file=.env.local` and the key loaded from AWS Secrets Manager:

```
npm run check:llm                                  # offline adapter tests: 41/41 pass
DESK_BACKEND=fixture npx tsx agents/scripts/contract-check.ts
npx tsx agents/scripts/smoke.ts                    # exits immediately, see finding 1
# one live field turn + one structured JSON call, with a fetch wrapper logging every request
npx tsx agents/scripts/_livecheck.tmp.ts           # temp probe, deleted after the run
```

## US host only

The fetch wrapper logged every outbound request for a live field turn (three model rounds) plus one `structured()` call. The only model host hit is `https://us.openrouter.ai/api/v1/chat/completions`, four times. The only other hosts in the log are the earthquake feeds (`servisnet.afad.gov.tr`, `earthquake.usgs.gov`), which are data, not model calls. `OPENROUTER_BASE_URL` was unset, so it defaulted to `https://us.openrouter.ai/api/v1`. Confirmed.

## Tools and JSON schema under require_parameters

Every request body carried `provider: {"require_parameters": true}`. A US provider, BaseTen, served `openai/gpt-oss-120b` on all four calls.

- Tools: the field turn sent 10 strict function tools. The model made two tool calls (`file_need`, `file_report`), the args passed schema checks, both events were filed, and the final answer was coherent across three rounds.
- JSON schema: `structured()` with `response_format: json_schema (strict)` returned `{"item":"tents","qty":15}`, valid JSON matching the schema.

Both succeed, so a US provider serves gpt-oss with tools and JSON-schema output, and the request does not fail closed on these parameters. Fail-closed is the `require_parameters` mechanism itself (D-0003): if no US provider supported every parameter, OpenRouter returns an error instead of routing elsewhere. That error path is `send()` throwing `LlmError`, already covered by `check:llm`.

## reasoning_details between tool rounds

gpt-oss emits `reasoning_details` on every round, including the two `tool_calls` rounds and the final `stop` round. The adapter passes them back on the assistant message: round 2's request carried one assistant message with `reasoning_details`, round 3's carried two. Multi-round tool use completed end to end with that pass-back in place, so it works as implemented. I did not run an A/B strip test to prove the model degrades without it (kept spend to a single probe). OpenRouter's guidance, quoted in `src/agents/shared/llm.ts`, is that preserving reasoning blocks is useful specifically for tool calling, so keep the pass-back.

## Key plan

`GET /api/v1/key` returns `is_free_tier: false`, a $50/month budget (usage 0), and `allowed_data_regions: ["global","europe","us"]`. The tier itself (Business vs another paid plan) is not exposed by the key endpoint, so I could not confirm "Business" from the API; "us" being an allowed data region plus the us.openrouter.ai routing is as far as the key itself proves.

## Findings

1. `src/agents/scripts/smoke.ts` is stale. Its scenario user ids are `zeynep`, `team-4`, `supplier-2`, `coord-1`, none of which exist on the fixture desk (current ids are `volunteer-callback`, `field-alpha`, `supplier-primary`, `coordinator-duty`). `smoke.ts` throws `unknown user zeynep` before any model call. The live probe above used the current ids.
2. `contract-check.ts` reports 15/16. The one miss was the quake-watcher `alert` event: `payload.kind` is `"quake"`, but `eventBody` only allows `silent_zone` or `cold`. The quake watcher and that check case were deleted in D-0017, so the mismatch is gone with them.