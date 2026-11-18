// Unit tests for the model adapter (agents/shared/llm.ts, cost.ts) and its callers, D-0003.
// No key, no network: fetch is replaced by a fake that answers like OpenRouter's chat completions API.
//   npm run check:llm
// Requirements: LLM-1 (every call via modelFor()/send() to the OpenRouter US endpoint, gpt-oss-120b,
// gpt-oss-20b for small jobs), LLM-2 (no Anthropic SDK or keys), and the offline half of LLM-3
// (role tools as strict functions, every tool input schema-checked). The live half of LLM-3
// (agents/scripts/smoke.ts on gpt-oss-120b) needs a key.

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "llm-test-"));
const ledger = join(dir, "usage.jsonl");
process.env.AGENT_USAGE_FILE = ledger;
process.env.AGENT_BUDGET_USD = "1";
process.env.DESK_BACKEND = "fixture";
process.env.OPENROUTER_API_KEY = "test-key";
for (const k of Object.keys(process.env)) if (/^OPENROUTER_(MODEL|EFFORT)_|^OPENROUTER_BASE_URL$/.test(k)) delete process.env[k];

const llm = await import("../agents/shared/llm.ts");
const cost = await import("../agents/shared/cost.ts");
const { toolsFor } = await import("../agents/personal/tools.ts");

// ── fake fetch ────────────────────────────────────────────────────────────────────────────────
const realFetch = globalThis.fetch;
let calls = [];
let answers = [];
function fakeFetch(url, init = {}) {
  const call = { url: String(url), init, body: init.body ? JSON.parse(init.body) : undefined };
  calls.push(call);
  if (!call.url.includes("/chat/completions")) return Promise.reject(new Error(`no network in tests: ${call.url}`));
  const next = answers.shift();
  if (!next) return Promise.reject(new Error("test: no answer queued"));
  return Promise.resolve(typeof next === "function" ? next(call) : next);
}
const json = (o, status = 200, headers = {}) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", ...headers } });
const completion = (message, finish = "stop", usage = { prompt_tokens: 100, completion_tokens: 20, cost: 0.0001 }) =>
  json({ id: "gen-1", model: "openai/gpt-oss-120b", choices: [{ index: 0, finish_reason: finish, message: { role: "assistant", ...message } }], usage });
const sse = (chunks) => new Response(chunks.map((c) => (typeof c === "string" ? c : `data: ${JSON.stringify(c)}\n\n`)).join(""),
  { status: 200, headers: { "content-type": "text/event-stream" } });
const modelCalls = () => calls.filter((c) => c.url.includes("/chat/completions"));

test.beforeEach(() => { calls = []; answers = []; globalThis.fetch = fakeFetch; writeFileSync(ledger, ""); delete process.env.OPENROUTER_BASE_URL; });
test.afterEach(() => { globalThis.fetch = realFetch; });
test.after(() => rmSync(dir, { recursive: true, force: true }));

// ── LLM-1: models and endpoint ────────────────────────────────────────────────────────────────
test("LLM-1 modelFor: gpt-oss-120b for chat, extract and summary; gpt-oss-20b for digest", () => {
  assert.deepEqual(llm.modelFor("chat"), { model: "openai/gpt-oss-120b", effort: "low" });
  assert.deepEqual(llm.modelFor("extract"), { model: "openai/gpt-oss-120b", effort: "low" });
  assert.deepEqual(llm.modelFor("summary"), { model: "openai/gpt-oss-120b", effort: "medium" });
  assert.deepEqual(llm.modelFor("digest"), { model: "openai/gpt-oss-20b", effort: "low" });
});

test("LLM-1 modelFor: OPENROUTER_MODEL_* and OPENROUTER_EFFORT_* override; a bad effort is ignored", () => {
  process.env.OPENROUTER_MODEL_CHAT = "openai/gpt-oss-20b";
  process.env.OPENROUTER_EFFORT_CHAT = "high";
  process.env.OPENROUTER_EFFORT_DIGEST = "max";
  try {
    assert.deepEqual(llm.modelFor("chat"), { model: "openai/gpt-oss-20b", effort: "high" });
    assert.equal(llm.modelFor("digest").effort, "low");
  } finally {
    delete process.env.OPENROUTER_MODEL_CHAT; delete process.env.OPENROUTER_EFFORT_CHAT; delete process.env.OPENROUTER_EFFORT_DIGEST;
  }
});

test("LLM-1 send(): POSTs to the US endpoint by default, with key, model, effort and require_parameters", async () => {
  answers.push(completion({ content: "hello" }));
  const r = await llm.send("t", { model: "openai/gpt-oss-120b", effort: "low", messages: [{ role: "user", content: "hi" }] });
  assert.equal(llm.DEFAULT_BASE_URL, "https://us.openrouter.ai/api/v1");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://us.openrouter.ai/api/v1/chat/completions");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, "Bearer test-key");
  assert.equal(calls[0].body.model, "openai/gpt-oss-120b");
  assert.deepEqual(calls[0].body.reasoning, { effort: "low" });
  assert.deepEqual(calls[0].body.provider, { require_parameters: true });
  assert.equal(r.text, "hello");
  assert.equal(r.finishReason, "stop");
});

test("LLM-1 send(): OPENROUTER_BASE_URL moves every request, and nothing else is called", async () => {
  process.env.OPENROUTER_BASE_URL = "https://gateway.example.test/v1/";
  answers.push(completion({ content: "a" }), completion({ content: "b" }));
  await llm.send("t", { model: "m", messages: [{ role: "user", content: "1" }] });
  await llm.structured({ name: "s", schema: { type: "object", additionalProperties: false, required: ["x"], properties: { x: { type: "string" } } }, system: "s", user: "u" })
    .catch(() => undefined);
  assert.ok(calls.length >= 2);
  for (const c of calls) assert.equal(c.url, "https://gateway.example.test/v1/chat/completions");
});

test("LLM-1 send(): no key → clear error, no request", async () => {
  delete process.env.OPENROUTER_API_KEY;
  try {
    await assert.rejects(llm.send("t", { model: "m", messages: [] }), /OPENROUTER_API_KEY is not set/);
    assert.equal(calls.length, 0);
  } finally { process.env.OPENROUTER_API_KEY = "test-key"; }
});

test("send(): retries 429 and 5xx, not 400; gives up after MAX_RETRIES", async () => {
  answers.push(json({ error: { message: "slow down" } }, 429, { "retry-after": "0" }), completion({ content: "ok" }));
  assert.equal((await llm.send("t", { model: "m", messages: [] })).text, "ok");
  assert.equal(calls.length, 2);

  calls = [];
  answers.push(json({ error: { message: "bad" } }, 400));
  await assert.rejects(llm.send("t", { model: "m", messages: [] }), (e) => e instanceof llm.LlmError && e.status === 400);
  assert.equal(calls.length, 1);

  calls = [];
  for (let i = 0; i <= llm.MAX_RETRIES; i++) answers.push(json({}, 503));
  await assert.rejects(llm.send("t", { model: "m", messages: [] }), /OpenRouter 503/);
  assert.equal(calls.length, llm.MAX_RETRIES + 1);
});

// ── cost and budget ───────────────────────────────────────────────────────────────────────────
test("cost: records OpenRouter's usage.cost; prices from the table when it is missing; unknown models priced high", async () => {
  answers.push(completion({ content: "x" }, "stop", { prompt_tokens: 1000, completion_tokens: 100, cost: 0.0042 }));
  await llm.send("ledger-test", { model: "openai/gpt-oss-120b", messages: [] });
  const row = JSON.parse(readFileSync(ledger, "utf8").trim());
  assert.equal(row.usd, 0.0042);
  assert.equal(row.priced, "openrouter");
  assert.equal(row.label, "ledger-test");

  const m = 1e6;
  assert.equal(cost.priceUsd("openai/gpt-oss-120b", { prompt_tokens: m, completion_tokens: m }), 0.03 + 0.15);
  assert.equal(cost.priceUsd("openai/gpt-oss-20b", { prompt_tokens: m, completion_tokens: m }), 0.018 + 0.09);
  assert.equal(cost.priceUsd("openai/gpt-oss-120b", { prompt_tokens: m, completion_tokens: 0, prompt_tokens_details: { cached_tokens: m } }), 0.015);
  assert.ok(cost.priceUsd("some/unknown", { prompt_tokens: m, completion_tokens: 0 }) >= 10);
});

test("budget: once the ledger reaches AGENT_BUDGET_USD, send() and sendStream() throw BudgetError and make no request", async () => {
  appendFileSync(ledger, JSON.stringify({ label: "x", model: "m", usd: 1.5 }) + "\n");
  await assert.rejects(llm.send("t", { model: "m", messages: [] }), cost.BudgetError);
  await assert.rejects(llm.sendStream("t", { model: "m", messages: [] }, () => {}), cost.BudgetError);
  await assert.rejects(llm.structured({ name: "s", schema: {}, system: "s", user: "u" }), cost.BudgetError);
  assert.equal(calls.length, 0);
});

// ── structured() ──────────────────────────────────────────────────────────────────────────────
const SCHEMA = {
  type: "object", additionalProperties: false, required: ["kind", "n", "tags"],
  properties: {
    kind: { anyOf: [{ type: "string", enum: ["a", "b"] }, { type: "null" }] },
    n: { type: ["integer", "null"] },
    tags: { type: "array", items: { type: "string" } },
  },
};

test("structured(): response_format json_schema strict, extract model, nulls dropped", async () => {
  answers.push(completion({ content: JSON.stringify({ kind: "a", n: null, tags: ["x"] }) }));
  const out = await llm.structured({ name: "x-extract", schema: SCHEMA, system: "sys", user: "tweet" });
  assert.deepEqual(out, { kind: "a", tags: ["x"] });
  const b = calls[0].body;
  assert.equal(b.model, "openai/gpt-oss-120b");
  assert.deepEqual(b.response_format, { type: "json_schema", json_schema: { name: "x-extract", strict: true, schema: SCHEMA } });
  assert.deepEqual(b.messages, [{ role: "system", content: "sys" }, { role: "user", content: "tweet" }]);
});

test("structured(): JSON that breaks the schema, non-JSON, cut-off and refusals all throw", async () => {
  answers.push(completion({ content: JSON.stringify({ kind: "zzz", n: 1, tags: [] }) }));
  await assert.rejects(llm.structured({ name: "s", schema: SCHEMA, system: "", user: "" }), /does not match the schema/);
  answers.push(completion({ content: "not json" }));
  await assert.rejects(llm.structured({ name: "s", schema: SCHEMA, system: "", user: "" }), /not JSON/);
  answers.push(completion({ content: "{" }, "length"));
  await assert.rejects(llm.structured({ name: "s", schema: SCHEMA, system: "", user: "" }), /max_tokens/);
  answers.push(completion({ content: null, refusal: "no" }));
  await assert.rejects(llm.structured({ name: "s", schema: SCHEMA, system: "", user: "" }), llm.RefusalError);
  answers.push(completion({ content: "" }, "content_filter"));
  await assert.rejects(llm.structured({ name: "s", schema: SCHEMA, system: "", user: "" }), llm.RefusalError);
});

test("checkSchema: types, nullable, enum, anyOf, required, additionalProperties, items", () => {
  assert.deepEqual(llm.checkSchema(SCHEMA, { kind: null, n: 3, tags: [] }), []);
  assert.ok(llm.checkSchema(SCHEMA, { kind: "a", n: 1.5, tags: [] }).length);
  assert.ok(llm.checkSchema(SCHEMA, { kind: "a", n: 1, tags: [1] }).length);
  assert.ok(llm.checkSchema(SCHEMA, { kind: "a", n: 1 }).some((e) => e.includes("tags: missing")));
  assert.ok(llm.checkSchema(SCHEMA, { kind: "a", n: 1, tags: [], extra: 1 }).some((e) => e.includes("not allowed")));
});

// ── streaming ─────────────────────────────────────────────────────────────────────────────────
test("sendStream(): text deltas reach onText in order; tool-call pieces are joined; usage recorded", async () => {
  answers.push(sse([
    ": OPENROUTER PROCESSING\n\n",
    { model: "openai/gpt-oss-120b", choices: [{ index: 0, delta: { role: "assistant", content: "Hel" } }] },
    { model: "openai/gpt-oss-120b", choices: [{ index: 0, delta: { content: "lo." } }] },
    { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "ask_desk", arguments: "{\"topic\":" } }] } }] },
    { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: "\"summary\"}" } }] } }] },
    { choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }], usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.00002 } },
    "data: [DONE]\n\n",
  ]));
  const seen = [];
  const r = await llm.sendStream("stream", { model: "openai/gpt-oss-120b", messages: [] }, (d) => seen.push(d));
  assert.deepEqual(seen, ["Hel", "lo."]);
  assert.equal(r.text, "Hello.");
  assert.equal(r.finishReason, "tool_calls");
  assert.deepEqual(r.toolCalls, [{ id: "call_1", type: "function", function: { name: "ask_desk", arguments: "{\"topic\":\"summary\"}" } }]);
  assert.deepEqual(r.message.tool_calls, r.toolCalls);
  assert.equal(calls[0].body.stream, true);
  assert.equal(JSON.parse(readFileSync(ledger, "utf8").trim()).usd, 0.00002);
});

// ── LLM-3 (offline): role tools and the tool-call round trip ──────────────────────────────────
const ctxFor = (role, extra = {}) => ({ user: { _id: "u", role }, myIncidents: [{ _id: "i1" }], ...extra });

test("LLM-3 toolsFor(): strict OpenAI functions per role, the per-role allowlist, no web_search", () => {
  const expected = {
    volunteer: 10, field: 10, supplier: 8, shelter: 9, coordinator: 10, public: 4,
  };
  for (const [role, n] of Object.entries(expected)) {
    const tools = toolsFor(ctxFor(role));
    assert.equal(tools.length, n, role);
    for (const t of tools) {
      assert.equal(t.type, "function");
      assert.equal(t.function.strict, true);
      assert.ok(t.function.description);
      const p = t.function.parameters;
      assert.equal(p.type, "object");
      assert.equal(p.additionalProperties, false);
      assert.deepEqual([...p.required].sort(), Object.keys(p.properties).sort(), `${role}/${t.function.name}: every key required`);
      assert.notEqual(t.function.name, "web_search");
    }
  }
  const pub = toolsFor(ctxFor("public")).map((t) => t.function.name);
  assert.deepEqual(pub, ["ask_desk", "file_need", "file_report", "file_closure"]);
  assert.ok(!toolsFor(ctxFor("field")).some((t) => t.type !== "function" || JSON.stringify(t).includes("web_search")));
});

test("LLM-3 runTurn(): tool call → schema check → tool result → final answer, all via OpenRouter", async () => {
  const { runTurn } = await import("../agents/personal/turn.ts");
  answers.push(
    completion({ content: null, tool_calls: [
      { id: "call_a", type: "function", function: { name: "ask_desk", arguments: JSON.stringify({ topic: "summary", region: null, page: 0 }) } },
      { id: "call_b", type: "function", function: { name: "ask_desk", arguments: JSON.stringify({ topic: "nope", region: null, page: 0 }) } },
      { id: "call_c", type: "function", function: { name: "ask_desk", arguments: "{not json" } },
    ] }, "tool_calls"),
    completion({ content: "Here is the summary." }),
  );
  const r = await runTurn({ userId: "coordinator-duty", text: "what is stuck?" });
  assert.equal(r.reply, "Here is the summary.");
  const mc = modelCalls();
  assert.equal(mc.length, 2);
  for (const c of mc) assert.equal(c.url, "https://us.openrouter.ai/api/v1/chat/completions");
  // Only model calls and the (failing) quake feed: no other host was asked for anything.
  for (const c of calls) assert.ok(c.url.startsWith("https://us.openrouter.ai/") || /usgs|afad/i.test(c.url), c.url);

  const first = mc[0].body;
  assert.equal(first.model, "openai/gpt-oss-120b");
  assert.equal(first.messages[0].role, "system");
  assert.equal(first.messages.at(-1).role, "user");
  assert.equal(typeof first.messages.at(-1).content, "string");
  assert.ok(first.tools.every((t) => t.type === "function" && t.function.strict === true));
  assert.ok(first.tools.some((t) => t.function.name === "decide_approval"));

  const second = mc[1].body.messages;
  const asst = second.find((m) => m.role === "assistant" && m.tool_calls);
  assert.deepEqual(asst.tool_calls.map((c) => c.id), ["call_a", "call_b", "call_c"]);
  const tool = Object.fromEntries(second.filter((m) => m.role === "tool").map((m) => [m.tool_call_id, m.content]));
  assert.deepEqual(Object.keys(tool).sort(), ["call_a", "call_b", "call_c"]);
  assert.ok(!tool.call_a.startsWith("Error"), tool.call_a.slice(0, 200));
  assert.match(tool.call_b, /^Error: Input did not match the ask_desk schema/);
  assert.match(tool.call_c, /^Error: Input did not match the ask_desk schema: arguments are not a JSON object/);
});

test("LLM-3 runTurn(): a tool outside the role's allowlist is refused, not run", async () => {
  const { runTurn } = await import("../agents/personal/turn.ts");
  answers.push(
    completion({ content: null, tool_calls: [{ id: "x1", type: "function", function: { name: "decide_approval",
      arguments: JSON.stringify({ task_id: "t1", approved: true, reason: "ok" }) } }] }, "tool_calls"),
    completion({ content: "I cannot do that." }),
  );
  const r = await runTurn({ userId: "field-alpha", text: "approve t1" });
  assert.deepEqual(r.eventIds, []);
  const tool = modelCalls()[1].body.messages.find((m) => m.role === "tool");
  assert.match(tool.content, /not available to the field role/);
});

test("runTurn(): a photo is not sent to the text-only model; the agent is told one came", async () => {
  const { runTurn, PHOTO_NOTE } = await import("../agents/personal/turn.ts");
  answers.push(completion({ content: "What does the photo show?" }));
  await runTurn({ userId: "field-alpha", text: "look", image: { mediaType: "image/png", base64: "iVBORw0KGgo=" } });
  const last = modelCalls()[0].body.messages.at(-1);
  assert.equal(typeof last.content, "string");
  assert.ok(last.content.includes(PHOTO_NOTE));
  assert.ok(!JSON.stringify(modelCalls()[0].body).includes("iVBORw0KGgo"));
});

test("summary: the shift handoff goes to gpt-oss-120b at medium effort", async () => {
  const { writeHandoff } = await import("../agents/personal/handoff.ts");
  answers.push(completion({ content: "1. Nothing on the desk." }));
  const h = await writeHandoff("antakya-2023", new Date());
  assert.equal(h.ok, true);
  assert.equal(modelCalls()[0].body.model, "openai/gpt-oss-120b");
  assert.deepEqual(modelCalls()[0].body.reasoning, { effort: "medium" });
});

// ── news search (WS) ──────────────────────────────────────────────────────────────────────────
test("news agent refuses to run, points at #10, makes no call", async () => {
  const news = await import("../agents/research/news-search.ts");
  await assert.rejects(news.searchNews({ region: "Antakya", when: "now" }), (e) => e instanceof news.NewsSearchOffError && /#10/.test(e.message));
  assert.equal(calls.length, 0);
});

// ── LLM-2 and invariant 3: static checks of the tree ──────────────────────────────────────────
function files(d, out = []) {
  for (const n of readdirSync(d)) {
    if (["node_modules", ".next", ".git"].includes(n)) continue;
    const p = join(d, n);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(ts|tsx|mjs|js|cjs)$/.test(n)) out.push(p);
  }
  return out;
}
const code = ["agents", "app", "components", "lib", "workers", "scripts"].flatMap((d) => files(join(root, d)));

test("LLM-2: no @anthropic-ai/sdk in package.json or any import; no ANTHROPIC_ key in .env.example", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(pkg.dependencies?.["@anthropic-ai/sdk"], undefined);
  assert.equal(pkg.devDependencies?.["@anthropic-ai/sdk"], undefined);
  for (const f of code) assert.ok(!/from\s+["']@anthropic-ai\/|require\(["']@anthropic-ai\//.test(readFileSync(f, "utf8")), f);
  const env = readFileSync(join(root, ".env.example"), "utf8");
  assert.ok(!/^\s*ANTHROPIC_/m.test(env));
  assert.match(env, /^OPENROUTER_API_KEY=/m);
  assert.match(env, /^OPENROUTER_BASE_URL=https:\/\/us\.openrouter\.ai\/api\/v1$/m);
  assert.ok(!/anthropic/i.test(readFileSync(join(root, "package-lock.json"), "utf8")), "package-lock.json mentions anthropic");
});

test("LLM-1: no other model host or model SDK anywhere outside agents/shared/llm.ts", () => {
  const deny = [
    /https?:\/\/[a-z.]*openrouter\.ai/i, /\/chat\/completions/, /api\.openai\.com/i, /anthropic\.com/i, /api\.groq\.com/i,
    /api\.together\.(xyz|ai)/i, /api\.mistral\.ai/i, /bedrock-runtime/i, /generativelanguage\.googleapis/i,
    /from\s+["'](openai|@anthropic-ai\/[^"']*|@ai-sdk\/[^"']*|ai|groq-sdk|together-ai|@mistralai\/[^"']*|@aws-sdk\/client-bedrock[^"']*|@openrouter\/[^"']*)["']/,
    /require\(["'](openai|@anthropic-ai\/[^"']*|@ai-sdk\/[^"']*|groq-sdk|together-ai|@mistralai\/[^"']*)["']\)/,
  ];
  for (const f of code) {
    if (f.endsWith(join("agents", "shared", "llm.ts")) || f.endsWith("llm-adapter.test.mjs")) continue;
    const text = readFileSync(f, "utf8");
    for (const re of deny) assert.ok(!re.test(text), `${f} matches ${re}`);
  }
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  for (const d of deps) assert.ok(!/^(openai|@anthropic-ai\/|@ai-sdk\/|ai$|groq-sdk|together-ai|@mistralai\/|@aws-sdk\/client-bedrock|@openrouter\/)/.test(d), d);
});

test("INV-3: no LLM import in lib/rules/, dispatcher, sweeper or memory keeper", () => {
  const ruled = [
    ...files(join(root, "lib", "rules")),
    join(root, "workers", "dispatcher.ts"), join(root, "workers", "sweeper.ts"), join(root, "workers", "memory-keeper.ts"),
  ];
  for (const f of ruled) assert.ok(!/shared\/llm|@anthropic-ai|openrouter/i.test(readFileSync(f, "utf8")), f);
});

// ── Evaluation round 1 fixes ──────────────────────────────────────────────────────────────────
test("prompts: no role prompt tells the agent to search the web while no search tool is defined", async () => {
  const { systemPrompt } = await import("../agents/personal/prompts.ts");
  for (const role of ["volunteer", "field", "supplier", "shelter", "coordinator", "public"]) {
    const hasSearch = toolsFor(ctxFor(role)).some((t) => /search/i.test(t.function.name));
    if (hasSearch) continue;
    const p = systemPrompt(role);
    assert.ok(!/search (the )?(web|internet|online)|web search|look (it )?up online|google/i.test(p), `${role} prompt mentions web search`);
  }
  const { systemPrompt: sp } = await import("../agents/personal/prompts.ts");
  assert.match(sp("supplier"), /no directory/i);
  assert.match(sp("supplier"), /report_problem/);
});

test("cost: a response with no usage records a pessimistic estimate (max_tokens at the top output rate) and warns", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  answers.push(json({ model: "openai/gpt-oss-120b", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "x" } }] }));
  await llm.send("no-usage", { model: "openai/gpt-oss-120b", max_tokens: 8000, messages: [] });
  const row = JSON.parse(readFileSync(ledger, "utf8").trim());
  assert.equal(row.priced, "estimate");
  assert.equal(row.usd, 8000 * 50 / 1e6);
  assert.ok(warn.mock.calls.some((c) => /no usage/i.test(String(c.arguments[0]))));

  writeFileSync(ledger, "");
  answers.push(sse([{ choices: [{ index: 0, delta: { content: "hi" }, finish_reason: "stop" }] }, "data: [DONE]\n\n"]));
  await llm.sendStream("no-usage-stream", { model: "openai/gpt-oss-120b", max_tokens: 2000, messages: [] }, () => {});
  const row2 = JSON.parse(readFileSync(ledger, "utf8").trim());
  assert.equal(row2.priced, "estimate");
  assert.equal(row2.usd, 2000 * 50 / 1e6);
  assert.ok(row2.usd > 0);
});

test("send(): finish_reason error throws LlmError (non-streamed and streamed)", async () => {
  answers.push(completion({ content: "partial" }, "error"));
  await assert.rejects(llm.send("t", { model: "m", messages: [] }), llm.LlmError);
  answers.push(sse([{ choices: [{ index: 0, delta: { content: "par" } }] }, { choices: [{ index: 0, delta: {}, finish_reason: "error" }], usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0 } }]));
  await assert.rejects(llm.sendStream("t", { model: "m", messages: [] }, () => {}), llm.LlmError);
});

for (const streamed of [false, true]) {
  const how = streamed ? "streamed" : "non-streamed";
  test(`runTurn() ${how}: finish_reason error is a failure, not an answer`, async () => {
    const { runTurn } = await import("../agents/personal/turn.ts");
    answers.push(streamed
      ? sse([{ choices: [{ index: 0, delta: { content: "Half an ans" } }] }, { choices: [{ index: 0, delta: {}, finish_reason: "error" }] }])
      : completion({ content: "Half an ans" }, "error"));
    await assert.rejects(runTurn({ userId: "field-alpha", text: "hi", ...(streamed ? { onText: () => {} } : {}) }), llm.LlmError);
  });

  test(`runTurn() ${how}: a length cut-off is said to be cut off, not saved as complete`, async () => {
    const { runTurn, CUT_OFF_NOTE } = await import("../agents/personal/turn.ts");
    const spoken = [];
    answers.push(streamed
      ? sse([{ choices: [{ index: 0, delta: { content: "The nearest shelter is" } }] }, { choices: [{ index: 0, delta: {}, finish_reason: "length" }], usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0 } }])
      : completion({ content: "The nearest shelter is" }, "length"));
    const r = await runTurn({ userId: "field-alpha", text: "where?", ...(streamed ? { onText: (d) => spoken.push(d) } : {}) });
    assert.ok(r.reply.endsWith(CUT_OFF_NOTE), r.reply);
    assert.equal(modelCalls().length, 1, "no further round after a cut-off");
    if (streamed) assert.ok(spoken.join("").includes(CUT_OFF_NOTE), "the cut-off note is spoken too");
  });
}

test("sendStream(): a streamed tool call with no id gets call_<index>", async () => {
  answers.push(sse([
    { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { name: "ask_desk", arguments: "{}" } }, { index: 1, function: { name: "ask_desk", arguments: "{}" } }] } }] },
    { choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }], usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0 } },
  ]));
  const r = await llm.sendStream("t", { model: "m", messages: [] }, () => {});
  assert.deepEqual(r.toolCalls.map((c) => c.id), ["call_0", "call_1"]);
});

test("send(): retries any 5xx (e.g. 520), 408 and 429; a 200 with a non-JSON body is an LlmError", async () => {
  answers.push(json({}, 520), json({}, 408), completion({ content: "ok" }));
  assert.equal((await llm.send("t", { model: "m", messages: [] })).text, "ok");
  assert.equal(calls.length, 3);
  answers.push(new Response("<html>gateway</html>", { status: 200 }));
  await assert.rejects(llm.send("t", { model: "m", messages: [] }), (e) => e instanceof llm.LlmError && /not JSON/.test(e.message));
});

test("sendStream(): a mid-stream error cancels the reader", async () => {
  let cancelled = false;
  const enc = new TextEncoder();
  const body = new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: "a" } }] })}\n\n`));
      c.enqueue(enc.encode(`data: ${JSON.stringify({ error: { message: "provider died", code: 502 } })}\n\n`));
    },
    cancel() { cancelled = true; },
  });
  answers.push(new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }));
  await assert.rejects(llm.sendStream("t", { model: "m", messages: [] }, () => {}), /provider died/);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(cancelled, true);
});

test("reasoning is sent back between tool rounds: reasoning_details (non-streamed), reasoning text (streamed)", async () => {
  const details = [{ type: "reasoning.text", text: "think", format: "unknown", index: 0 }];
  answers.push(completion({ content: null, reasoning: "think", reasoning_details: details,
    tool_calls: [{ id: "c1", type: "function", function: { name: "ask_desk", arguments: "{}" } }] }, "tool_calls"));
  const r = await llm.send("t", { model: "m", messages: [] });
  assert.deepEqual(r.message.reasoning_details, details);

  answers.push(sse([
    { choices: [{ index: 0, delta: { reasoning: "thi" } }] },
    { choices: [{ index: 0, delta: { reasoning: "nk", tool_calls: [{ index: 0, id: "c1", function: { name: "ask_desk", arguments: "{}" } }] } }] },
    { choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }], usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0 } },
  ]));
  const s = await llm.sendStream("t", { model: "m", messages: [] }, () => {});
  assert.equal(s.message.reasoning, "think");
  assert.equal(s.message.reasoning_details, undefined);
});
