// Contract check: does the running API still match what the screens read and post?
// Run against the dev server: npm run check:contract (BASE_URL, default http://localhost:3000).
// Read-only on real data. Every post uses a task id that does not exist, so the answer is 404.
// A 400 means a body we build drifted from the server's schema.
const base = process.env.BASE_URL ?? "http://localhost:3000";
const ghost = "task-contract-check-does-not-exist";
let failed = 0;

const line = (ok, name, why = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${why ? `, ${why}` : ""}`);
  if (!ok) failed++;
};

async function call(method, path, body) {
  try {
    const r = await fetch(base + path, {
      method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, json: await r.json().catch(() => null) };
  } catch (e) {
    return { status: 0, json: null, error: String(e.cause?.code ?? e.message) };
  }
}

const missing = (obj, keys) => keys.filter((k) => !(k in obj));

// GET shapes
{
  const r = await call("GET", "/api/board");
  const lists = ["sites", "needs", "roads", "shelters", "zones", "incidents", "tasks"];
  const bad = r.status !== 200 ? `status ${r.status}` : [...missing(r.json ?? {}, [...lists, "health"]),
    ...lists.filter((k) => k in (r.json ?? {}) && !Array.isArray(r.json[k]))].join(", ");
  line(!bad, "GET /api/board", bad && `${bad}${r.error ? ` (${r.error}, is the dev server up?)` : ""}`);
}
{
  const r = await call("GET", "/api/health");
  const bad = r.status !== 200 ? `status ${r.status}` : [...missing(r.json ?? {}, ["pending", "oldestPendingSeconds", "failed", "lastLoopAt", "model"]),
    ...(r.json?.model && typeof r.json.model.host !== "string" ? ["model.host"] : [])].join(", ");
  line(!bad, "GET /api/health", bad && `missing or wrong: ${bad}`);
}
{
  const r = await call("GET", "/api/events?limit=5");
  let bad = r.status !== 200 ? `status ${r.status}` : !Array.isArray(r.json) ? "not an array" : "";
  if (!bad) bad = r.json.flatMap((e, i) => missing(e, ["_id", "ts", "type", "status"]).map((k) => `[${i}].${k}`)).join(", ");
  if (!bad && r.json.some((e, i) => i && +new Date(e.ts) < +new Date(r.json[i - 1].ts))) bad = "not oldest first";
  line(!bad, "GET /api/events?limit=5", bad && `missing or wrong: ${bad}`);
}

// POST bodies, copied from taskEvents.ts, FieldPhone.tsx, ApprovalCard.tsx.
// The role in ?user= must be allowed to post that type, or the 403 hides the schema check.
const problem = { kind: "vehicle_breakdown", text: "Vehicle problem", textEn: "Vehicle problem", taskId: ghost, canContinue: false };
const posts = [
  ["task button, accepted", "field-alpha", { type: "answer", source: "person", payload: { taskId: ghost, result: "accepted" } }],
  ["task button, declined", "field-alpha", { type: "answer", source: "person", payload: { taskId: ghost, result: "declined" } }],
  ["task button, done", "field-alpha", { type: "answer", source: "person", payload: { taskId: ghost, result: "done" } }],
  ["task button, problem", "field-alpha", { type: "incident", source: "person", payload: problem }],
  ["task button, problem with coords", "field-alpha", { type: "incident", source: "person", payload: { ...problem, coords: [38.4, 38.36] } }],
  ["field phone, accepted with eta", "field-alpha", { type: "answer", source: "person", dedupeKey: "contract-check-1", observedAt: new Date().toISOString(), payload: { taskId: ghost, result: "accepted", etaMinutes: 15 } }],
  ["field phone, arrived", "field-alpha", { type: "answer", source: "person", dedupeKey: "contract-check-2", observedAt: new Date().toISOString(), payload: { taskId: ghost, result: "accepted", etaMinutes: 0, note: "Arrived" } }],
  ["field phone, done with note", "field-alpha", { type: "answer", source: "person", dedupeKey: "contract-check-3", observedAt: new Date().toISOString(), payload: { taskId: ghost, result: "done", note: "Done" } }],
  ["approval, approved", "coordinator-duty", { type: "approval", source: "person", payload: { taskId: ghost, approved: true } }],
  ["approval, rejected", "coordinator-duty", { type: "approval", source: "person", payload: { taskId: ghost, approved: false } }],
];
for (const [name, user, body] of posts) {
  const r = await call("POST", `/api/events?user=${user}`, body);
  const issues = r.status === 400 ? ` ${JSON.stringify(r.json?.issues ?? r.json)}` : "";
  const why = r.status === 404 ? "" : `expected 404, got ${r.status}${issues}${r.json?.error && r.status !== 400 ? ` (${r.json.error})` : ""}`;
  line(r.status === 404, `POST /api/events, ${name}`, why);
}

// Chat. A missing OPENROUTER_API_KEY is a known cause, not a drifted contract, so it is named and not counted.
{
  const r = await call("POST", "/api/chat?user=volunteer-callback", { text: "ping" });
  if (r.status === 200 && typeof r.json?.reply === "string") line(true, "POST /api/chat", "200 with a reply");
  else if (r.status === 502) console.log("note POST /api/chat, 502, the server may be missing OPENROUTER_API_KEY (see .env.example)");
  else line(false, "POST /api/chat", `status ${r.status}${r.json?.error ? `, ${r.json.error}` : ""}`);
}

console.log(failed ? `${failed} check${failed > 1 ? "s" : ""} failed` : "all checks passed");
process.exit(failed ? 1 : 0);
