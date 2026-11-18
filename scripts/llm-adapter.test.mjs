// Unit tests for the model adapter (agents/shared/llm.ts, cost.ts) and its callers, D-0003.
// No key, no network: fetch is replaced by a fake that answers like OpenRouter's chat completions API.
//   npm run check:llm
// Requirements: LLM-1 (every call via modelFor()/send() to the OpenRouter US endpoint, gpt-oss-120b,
// gpt-oss-20b for small jobs), LLM-2 (no Anthropic SDK or keys), and the offline half of LLM-3
// (role tools as strict functions, every tool input schema-checked). The live half of LLM-3
// (agents/scripts/smoke.ts on gpt-oss-120b) needs a key.

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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
const code = [...["agents", "app", "components", "lib", "workers", "scripts"].flatMap((d) => files(join(root, d))),
  ...readdirSync(root).filter((n) => /\.(ts|mjs|js)$/.test(n)).map((n) => join(root, n))];

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
  // ...and no code, script or deploy file reads an ANTHROPIC_ variable.
  const deploy = readdirSync(join(root, "deploy"), { recursive: true }).map((n) => join(root, "deploy", String(n))).filter((p) => /\.(sh|mjs|js|ts|ya?ml)$/.test(p));
  for (const f of [...code, ...deploy, join(root, ".github", "workflows", "ci.yml"), join(root, ".github", "workflows", "deploy.yml")].filter((f) => existsSync(f))) {
    if (f.endsWith("llm-adapter.test.mjs")) continue;
    assert.ok(!/ANTHROPIC_/.test(readFileSync(f, "utf8")), `${f} reads an ANTHROPIC_ variable`);
  }
});

test("LLM-1: no other model host or model SDK anywhere outside agents/shared/llm.ts (and its model-host.ts)", () => {
  const deny = [
    /https?:\/\/[a-z.]*openrouter\.ai/i, /\/chat\/completions/, /api\.openai\.com/i, /api\.anthropic\.com/i, /api\.groq\.com/i,
    /api\.together\.(xyz|ai)/i, /api\.mistral\.ai/i, /bedrock-runtime/i, /generativelanguage\.googleapis/i,
    /from\s+["'](openai|@anthropic-ai\/[^"']*|@ai-sdk\/[^"']*|ai|groq-sdk|together-ai|@mistralai\/[^"']*|@aws-sdk\/client-bedrock[^"']*|@openrouter\/[^"']*)["']/,
    /require\(["'](openai|@anthropic-ai\/[^"']*|@ai-sdk\/[^"']*|groq-sdk|together-ai|@mistralai\/[^"']*)["']\)/,
  ];
  for (const f of code) {
    // The adapter is llm.ts plus its edge-safe host module (model-host.ts, loaded by instrumentation.ts).
    if (f.endsWith(join("agents", "shared", "llm.ts")) || f.endsWith(join("agents", "shared", "model-host.ts")) || f.endsWith("llm-adapter.test.mjs")) continue;
    const text = readFileSync(f, "utf8");
    for (const re of deny) assert.ok(!re.test(text), `${f} matches ${re}`);
  }
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  for (const d of deps) assert.ok(!/^(openai|@anthropic-ai\/|@ai-sdk\/|ai$|groq-sdk|together-ai|@mistralai\/|@aws-sdk\/client-bedrock|@openrouter\/)/.test(d), d);
});

// Import graph: every static import, export-from and dynamic import(), type-only imports included,
// with "./" and "@/" (tsconfig paths) resolved. Bare package names are not followed.
const EXTS = ["", ".ts", ".tsx", ".mjs", ".js", "/index.ts", "/index.tsx"];
function resolveImport(from, spec) {
  const base = spec.startsWith("@/") ? join(root, spec.slice(2)) : spec.startsWith(".") ? join(dirname(from), spec) : null;
  if (!base) return null;
  for (const e of EXTS) { const p = base + e; if (existsSync(p) && statSync(p).isFile()) return p; }
  return null;
}
function importsOf(f) {
  const out = [];
  const re = /(?:^|[;\n])\s*(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\sfrom\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
  for (const m of readFileSync(f, "utf8").matchAll(re)) out.push(m[1] ?? m[2]);
  return out;
}
/** The import chain from any of `starts` to `target`, or null when it is unreachable. */
function chainTo(starts, target) {
  const prev = new Map(starts.map((s) => [s, null]));
  const queue = [...starts];
  while (queue.length) {
    const f = queue.shift();
    for (const spec of importsOf(f)) {
      const r = resolveImport(f, spec);
      if (r && !prev.has(r)) { prev.set(r, f); queue.push(r); }
    }
  }
  if (!prev.has(target)) return null;
  const chain = [];
  for (let c = target; c; c = prev.get(c)) chain.unshift(c.slice(root.length));
  return chain;
}
const LLM_FILE = join(root, "agents", "shared", "llm.ts");

test("INV-3: rules, dispatcher, sweeper and memory keeper never reach agents/shared/llm.ts through any import chain", () => {
  const ruled = [
    ...files(join(root, "lib", "rules")),
    join(root, "workers", "dispatcher.ts"), join(root, "workers", "sweeper.ts"), join(root, "workers", "memory-keeper.ts"),
  ];
  assert.ok(ruled.length >= 4 && ruled.every((f) => existsSync(f)));
  assert.equal(chainTo(ruled, LLM_FILE), null, `reachable: ${chainTo(ruled, LLM_FILE)?.join(" -> ")}`);
  // The walk itself works: the personal agent's turn does reach the adapter, through "../shared/llm".
  assert.deepEqual(chainTo([join(root, "agents", "personal", "turn.ts")], LLM_FILE), ["agents/personal/turn.ts", "agents/shared/llm.ts"]);
  // ...and through an "@/" alias and a second hop (route → agents/personal/turn → shared/llm).
  assert.ok(chainTo([join(root, "app", "api", "chat", "route.ts")], LLM_FILE)?.length >= 3);
});

// ── Evaluation round 1 fixes ──────────────────────────────────────────────────────────────────
const ROLES = ["volunteer", "field", "supplier", "shelter", "coordinator", "public"];
// Every tool any role has, plus tools that are gone: a prompt must not name them unless the role has them.
const ALL_TOOLS = new Set([...ROLES.flatMap((r) => toolsFor(ctxFor(r)).map((t) => t.function.name)), "web_search", "emit_findings"]);
const sentences = (p) => p.split(/(?<=[.!?])\s+|\n+/);

test("LLM-5: a prompt names a tool only if the role has it, or gates it with \"if/when you have\"", async () => {
  const { systemPrompt } = await import("../agents/personal/prompts.ts");
  for (const role of ROLES) {
    const has = new Set(toolsFor(ctxFor(role)).map((t) => t.function.name));
    for (const sentence of sentences(systemPrompt(role))) {
      for (const m of sentence.matchAll(/\b[a-z]+(?:_[a-z]+)+\b/g)) {
        const name = m[0];
        if (!ALL_TOOLS.has(name) || has.has(name)) continue;
        const upTo = sentence.slice(0, m.index + name.length);
        assert.match(upTo, new RegExp(`\\b(if|when)\\b[^.]*\\byou have\\b[^.]*\\b${name}\\b`, "i"),
          `${role}: names ${name}, which it does not have, without "if/when you have": ${sentence.slice(0, 160)}`);
      }
    }
  }
});

test("LLM-5: no prompt tells the agent to search the web while no search tool is defined", async () => {
  const { systemPrompt } = await import("../agents/personal/prompts.ts");
  for (const role of ROLES) {
    if (toolsFor(ctxFor(role)).some((t) => /search/i.test(t.function.name))) continue;
    assert.ok(!/search (the )?(web|internet|online)|web search|look (it )?up online|google (it|search)/i.test(systemPrompt(role)), `${role} prompt mentions web search`);
  }
  assert.match(systemPrompt("supplier"), /no directory/i);
  assert.match(systemPrompt("supplier"), /report_problem/);
});

test("LLM-5: no prompt or tool description says the agent can see or read photos (the models are text-only)", async () => {
  const { systemPrompt } = await import("../agents/personal/prompts.ts");
  const { PHOTO_NOTE } = await import("../agents/personal/turn.ts");
  const texts = [...ROLES.map((r) => [r, systemPrompt(r)]), ...ROLES.flatMap((r) => toolsFor(ctxFor(r)).map((t) => [`${r}/${t.function.name}`, t.function.description]))];
  for (const [where, text] of texts) {
    for (const sentence of sentences(text)) {
      if (!/\b(photo|image|picture|whiteboard)s?\b/i.test(sentence)) continue;
      if (/\b(read|see|look at|readable|visible|from (a|the|their) (photo|image|picture))\b/i.test(sentence)) {
        assert.match(sentence, /\b(cannot|can't|can not|not able|unable)\b/i, `${where}: ${sentence}`);
      }
    }
  }
  assert.match(systemPrompt("shelter"), /ask (them|the person) for the two numbers/i);
  // /api/chat does not store photos (app/api/chat/route.ts passes them only to runTurn), so no prompt may say it does.
  for (const r of ROLES) {
    for (const sentence of sentences(systemPrompt(r))) {
      if (/\bphotos?\b[^.]*\b(kept|saved|stored|attached to)\b/i.test(sentence)) assert.match(sentence, /\bnot (kept|saved|stored)\b/i, `${r}: ${sentence}`);
    }
  }
  assert.match(PHOTO_NOTE, /cannot see photos/);
});

test("LLM-4 cost: no usage → estimate at the model's own rates (request size as input, max_tokens as output), with a warning", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  answers.push(json({ model: "openai/gpt-oss-120b", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "x" } }] }));
  await llm.send("no-usage", { model: "openai/gpt-oss-120b", max_tokens: 8000, messages: [] });
  const row = JSON.parse(readFileSync(ledger, "utf8").trim());
  assert.equal(row.priced, "estimate");
  const len = calls[0].init.body.length;
  assert.equal(row.usd, Number(((len * 0.03 + 8000 * 0.15) / 1e6).toFixed(6)));
  assert.ok(warn.mock.calls.some((c) => /no usage/i.test(String(c.arguments[0]))));

  writeFileSync(ledger, "");
  answers.push(sse([{ choices: [{ index: 0, delta: { content: "hi" }, finish_reason: "stop" }] }, "data: [DONE]\n\n"]));
  await llm.sendStream("no-usage-stream", { model: "openai/gpt-oss-120b", max_tokens: 2000, messages: [] }, () => {});
  const row2 = JSON.parse(readFileSync(ledger, "utf8").trim());
  assert.equal(row2.priced, "estimate");
  assert.equal(row2.usd, Number(((calls[1].init.body.length * 0.03 + 2000 * 0.15) / 1e6).toFixed(6)));
  assert.ok(row2.usd > 0);

  // An unknown model keeps the worst case: $10/M in, $50/M out.
  writeFileSync(ledger, "");
  answers.push(json({ choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "x" } }] }));
  await llm.send("no-usage-unknown", { model: "some/unknown", max_tokens: 1000, messages: [] });
  const row3 = JSON.parse(readFileSync(ledger, "utf8").trim());
  assert.equal(row3.usd, Number(((calls[2].init.body.length * 10 + 1000 * 50) / 1e6).toFixed(6)));
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

// ── Evaluation round 2 fixes ──────────────────────────────────────────────────────────────────
test("LLM-4: a mid-stream {error, usage} chunk records its cost before throwing", async () => {
  answers.push(sse([
    { choices: [{ index: 0, delta: { content: "par" } }] },
    { error: { message: "provider died", code: 502 }, usage: { prompt_tokens: 50, completion_tokens: 10, cost: 0.0123 } },
  ]));
  await assert.rejects(llm.sendStream("mid-error", { model: "openai/gpt-oss-120b", max_tokens: 100, messages: [] }, () => {}), /provider died/);
  const row = JSON.parse(readFileSync(ledger, "utf8").trim());
  assert.equal(row.label, "mid-error");
  assert.equal(row.usd, 0.0123);
});

test("LLM-4: a mid-stream error without usage records the estimate before throwing", async () => {
  answers.push(sse([{ error: { message: "gone" } }]));
  await assert.rejects(llm.sendStream("mid-error-2", { model: "openai/gpt-oss-120b", max_tokens: 100, messages: [] }, () => {}), /gone/);
  const row = JSON.parse(readFileSync(ledger, "utf8").trim());
  assert.equal(row.priced, "estimate");
  assert.ok(row.usd > 0);
});

test("LLM-4: a 200 whose JSON body has `error` records usage (or the estimate) before throwing", async () => {
  answers.push(json({ error: { message: "upstream failed", code: 502 }, usage: { prompt_tokens: 5, completion_tokens: 0, cost: 0.0007 } }));
  await assert.rejects(llm.send("body-error", { model: "openai/gpt-oss-120b", messages: [] }), (e) => e instanceof llm.LlmError && /upstream failed/.test(e.message));
  assert.equal(JSON.parse(readFileSync(ledger, "utf8").trim()).usd, 0.0007);

  writeFileSync(ledger, "");
  answers.push(json({ error: { message: "upstream failed" } }));
  await assert.rejects(llm.send("body-error-2", { model: "openai/gpt-oss-120b", max_tokens: 500, messages: [] }), llm.LlmError);
  const row = JSON.parse(readFileSync(ledger, "utf8").trim());
  assert.equal(row.priced, "estimate");
  assert.ok(row.usd > 0);

  writeFileSync(ledger, "");
  answers.push(new Response("<html>gateway</html>", { status: 200 }));
  await assert.rejects(llm.send("not-json", { model: "openai/gpt-oss-120b", max_tokens: 500, messages: [] }), llm.LlmError);
  assert.equal(JSON.parse(readFileSync(ledger, "utf8").trim()).priced, "estimate");
});

test("LLM-1: in production, any base URL whose host is not us.openrouter.ai is refused before a request", async () => {
  const old = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    for (const bad of ["https://openrouter.ai/api/v1", "https://eu.openrouter.ai/api/v1", "https://gateway.example.test/v1", "http://us.openrouter.ai.evil.test/api/v1", "not a url"]) {
      process.env.OPENROUTER_BASE_URL = bad;
      assert.throws(() => llm.assertModelHost(), /us\.openrouter\.ai/);
      await assert.rejects(llm.send("t", { model: "m", messages: [] }), /us\.openrouter\.ai/);
    }
    assert.equal(calls.length, 0);
    process.env.OPENROUTER_BASE_URL = "https://us.openrouter.ai/api/v1";
    assert.doesNotThrow(() => llm.assertModelHost());
    delete process.env.OPENROUTER_BASE_URL;
    assert.doesNotThrow(() => llm.assertModelHost());
    answers.push(completion({ content: "ok" }));
    assert.equal((await llm.send("t", { model: "m", messages: [] })).text, "ok");
  } finally {
    process.env.NODE_ENV = old;
    if (old === undefined) delete process.env.NODE_ENV;
  }
});

test("LLM-1: the server refuses to start in production with another model host (exit 1 at startup)", async (t) => {
  const { startupCheck } = await import("../agents/shared/model-host.ts");
  const { register } = await import("../instrumentation.ts");
  const src = readFileSync(join(root, "instrumentation.ts"), "utf8");
  assert.match(src, /startupCheck\(\(code\) => process\.exit\(code\)\)/);
  const old = { env: process.env.NODE_ENV, rt: process.env.NEXT_RUNTIME };
  t.mock.method(console, "error", () => {});
  process.env.NODE_ENV = "production"; process.env.NEXT_RUNTIME = "nodejs";
  try {
    process.env.OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
    const exits = [];
    assert.throws(() => startupCheck((c) => exits.push(c)), /us\.openrouter\.ai/);
    assert.deepEqual(exits, [1]);
    delete process.env.OPENROUTER_BASE_URL;
    const none = [];
    startupCheck((c) => none.push(c));
    assert.deepEqual(none, []);
    await register();   // the real hook, with the default (US) host: starts
  } finally {
    for (const [k, v] of [["NODE_ENV", old.env], ["NEXT_RUNTIME", old.rt]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});

test("LLM-1: modelInfo() for /api/health reports the host and the model ids, and nothing secret", () => {
  process.env.OPENROUTER_API_KEY = "sk-or-secret-value";
  try {
    const info = llm.modelInfo();
    assert.deepEqual(info, {
      host: "us.openrouter.ai", usOnly: true,
      models: { chat: "openai/gpt-oss-120b", extract: "openai/gpt-oss-120b", summary: "openai/gpt-oss-120b", digest: "openai/gpt-oss-20b" },
    });
    assert.ok(!JSON.stringify(info).includes("secret"));
    process.env.OPENROUTER_BASE_URL = "https://user:pw@gateway.example.test/v1?key=abc";
    assert.deepEqual({ host: llm.modelInfo().host, usOnly: llm.modelInfo().usOnly }, { host: "gateway.example.test", usOnly: false });
    assert.ok(!JSON.stringify(llm.modelInfo()).includes("pw"));
  } finally { process.env.OPENROUTER_API_KEY = "test-key"; }
});

test("LLM-1: GET /api/health carries the model block next to the queue health", async () => {
  const src = readFileSync(join(root, "app", "api", "health", "route.ts"), "utf8");
  assert.match(src, /healthBody\(\)/);
  assert.match(src, /from "@\/lib\/health-body"/);
  const { healthBody } = await import("../lib/health-body.ts");
  const body = await healthBody(async () => ({ pending: 1, oldestPendingSeconds: 2, failed: 0, lastLoopAt: null }));
  assert.deepEqual(body, { pending: 1, oldestPendingSeconds: 2, failed: 0, lastLoopAt: null, model: llm.modelInfo() });
  assert.equal(body.model.host, "us.openrouter.ai");
  // Still reported when the queue cannot be read (no MongoDB): the 500 body carries it too.
  assert.match(src, /error: "server error", model: modelBlock\(\)/);
  const { modelBlock } = await import("../lib/health-body.ts");
  assert.deepEqual(modelBlock(), llm.modelInfo());
});
