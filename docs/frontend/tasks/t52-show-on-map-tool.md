---
id: t52-show-on-map-tool
effort: medium
checkpoint: metrics
files: agents/personal/tools.ts, agents/personal/prompts.ts (one short paragraph), lib/openapi.ts (ChatResponse actions description only)
---
# A show_on_map tool for the personal agent

Companion to t51 (the screen draws map cards). Like `visualize_metric` (t41, read its code in `agents/personal/tools.ts`), add `show_on_map`: input `{ kinds: enum[] of site, shelter, road, need, incident, task; text?: string; status?: string; near_me?: boolean; why: string }`. Description: call it when the person asks where something is, wants locations, the nearest thing, or anything on a map. At most 1 per turn.

In `run()`: find the matching records on the board copy the turn already loads, and return to the model a short grounded list (name, one-line state, distance from the person when `near_me` and the person has coords). The turn's action carries `{ tool: "show_on_map", summary, ok, type: "show_map", kinds, ids, text }` (the ids of the matches, at most 50). Keep the diff small: Ömer owns this code. Comment on issue #27 with what changed.

Test without calling the model: a throwaway tsx script calling `runTool("show_on_map", { kinds: ["shelter"], why: "test" }, ctx)` on a fixture context, delete after. Accept when tsc, eslint and check:tokens pass and the script returns the shelters with an action of `type: "show_map"`.
