// Checks POST /api/events without starting Next: calls the route handler directly.
// Also checks that lib/openapi.ts lists exactly the routes in app/api, with the same methods.
// Run: npm run api:check (needs npm run db:seed first, and AGENT_KEY + DEMO_MODE=1 in .env.local).
// Creates one test task and some events, and deletes all of them at the end.
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { POST } from "../app/api/events/route";
import { closeDb, cols } from "./db";
import { buildSpec, UNDOCUMENTED } from "./openapi";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

/** Every app/api route file, as an OpenAPI path ([id] → {id}) with the methods it exports. */
async function routeFiles(): Promise<Map<string, string[]>> {
  const root = join(import.meta.dirname, "..", "app");
  const found = new Map<string, string[]>();
  for (const f of await readdir(join(root, "api"), { recursive: true })) {
    if (!/(^|[/\\])route\.(ts|tsx|js)$/.test(f)) continue;
    const dir = relative(root, join(root, "api", f)).split(sep).slice(0, -1);
    const path = "/" + dir.map((s) => s.replace(/^\[\.{0,3}(.+)\]$/, "{$1}")).join("/");
    const src = await readFile(join(root, "api", f), "utf8");
    const methods = METHODS.filter((m) =>
      new RegExp(`export\\s+(async\\s+)?(function|const)\\s+${m}\\b|export\\s+const\\s*\\{[^}]*\\b${m}\\b`).test(src));
    found.set(path, methods);
  }
  return found;
}

async function checkSpecMatchesRoutes() {
  const spec = buildSpec();
  const files = await routeFiles();
  const documented = new Map(Object.entries(spec.paths).map(([p, ops]) =>
    [p, Object.keys(ops).map((m) => m.toUpperCase()).sort()]));
  const skipped = (p: string) => UNDOCUMENTED.some((u) => p === u || p.startsWith(u.endsWith("/") ? u : `${u}/`));

  for (const [path, methods] of files) {
    if (skipped(path)) continue;
    assert(documented.has(path), `${path} has a route file but no entry in lib/openapi.ts (or UNDOCUMENTED)`);
    assert.deepEqual(documented.get(path), [...methods].sort(), `${path}: methods in lib/openapi.ts differ from the route file`);
  }
  for (const path of documented.keys()) {
    assert(files.has(path), `${path} is in lib/openapi.ts but app${path}/route.ts does not exist`);
  }
  assert(JSON.stringify(spec).length > 1000 && spec.components.schemas.EventBody, "spec builds");
  console.log(`ok  openapi: ${documented.size} documented, ${[...files.keys()].filter(skipped).length} undocumented on purpose, routes match`);
}

const BASE = "http://localhost/api/events";
const created: string[] = [];
let passed = 0;

async function post(body: unknown, opts: { user?: string; key?: string; raw?: string } = {}) {
  const url = opts.user ? `${BASE}?user=${opts.user}` : BASE;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.key !== undefined) headers["x-agent-key"] = opts.key;
  const res = await POST(new Request(url, { method: "POST", headers, body: opts.raw ?? JSON.stringify(body) }));
  const json = (await res.json()) as { id?: string; error?: string };
  if (json.id) created.push(json.id);
  return { status: res.status, ...json };
}

async function expect(name: string, p: ReturnType<typeof post>, status: number) {
  const r = await p;
  assert.equal(r.status, status, `${name}: expected ${status}, got ${r.status} ${r.error ?? ""}`);
  passed++;
  console.log(`ok  ${status}  ${name}${r.error ? `  (${r.error})` : ""}`);
  return r;
}

async function main() {
  await checkSpecMatchesRoutes();

  const key = process.env.AGENT_KEY;
  assert(key, "set AGENT_KEY in .env.local");
  assert.equal(process.env.DEMO_MODE, "1", "set DEMO_MODE=1 in .env.local");
  const c = await cols();
  assert(await c.users.findOne({ _id: "coordinator-duty" }), "run npm run db:seed first");

  await c.tasks.deleteOne({ _id: "check-task" });
  await c.tasks.insertOne({
    _id: "check-task", type: "rescue", recordType: "site", recordId: "check-site", assignee: "field-alpha",
    tried: [], risk: "high", tier: 0, priority: 0, status: "waiting_approval", open: true,
    title: "check", detail: "check", deadline: new Date(), history: [], deskId: "malatya-2023",
  });

  // --- identity ---
  const alert = {
    type: "alert", source: "nasa", observedAt: "2023-02-09T23:59:59Z", dedupeKey: "check:alert",
    payload: { zoneId: "z1", kind: "cold", evidence: { minTempC: -14.4 } },
  };
  const a = await expect("agent posts an alert (like the satellite watcher)", post(alert, { key }), 200);
  const b = await expect("same dedupeKey again returns the same id", post(alert, { key }), 200);
  assert.equal(a.id, b.id);
  const ev = await c.events.findOne({ _id: a.id });
  assert.equal(ev?.actor, "nasa-agent"); assert.equal(ev?.lane, 1);
  assert(ev?.observedAt instanceof Date);
  console.log("    actor nasa-agent, lane 1, observedAt stored as a date");

  await expect("wrong agent key", post(alert, { key: "nope" }), 401);
  await expect("nobody signed in", post(alert), 401);
  await expect("unknown demo user", post(alert, { user: "ghost" }), 401);

  // --- a person ---
  const report = {
    type: "report", source: "person", actor: "coordinator-duty",
    payload: { kind: "trapped", text: "test", textEn: "test" },
  };
  const r = await expect("field team posts a report", post(report, { user: "field-alpha" }), 200);
  const rev = await c.events.findOne({ _id: r.id });
  assert.equal(rev?.actor, "field-alpha", "the body's actor is ignored for a person");
  assert.equal(rev?.lane, 0); assert.equal(rev?.deskId, "malatya-2023");
  console.log("    actor field-alpha (body said coordinator-duty), lane 0");

  await expect("person claims to be a tweet", post({ ...report, source: "x" }, { user: "field-alpha" }), 403);
  await expect("person posts a need directly", post({
    type: "need", source: "person", payload: { item: "blankets", quantity: 20, lifeThreatening: true },
  }, { user: "field-alpha" }), 403);
  await expect("person posts an alert", post({ ...alert, source: "person" }, { user: "coordinator-duty" }), 403);

  // --- approvals ---
  const approve = { type: "approval", source: "person", payload: { taskId: "check-task", approved: true } };
  await expect("volunteer approves", post(approve, { user: "volunteer-callback" }), 403);
  await expect("coordinator approves", post(approve, { user: "coordinator-duty" }), 200);
  await expect("coordinator approves a missing task",
    post({ ...approve, payload: { taskId: "nope", approved: true } }, { user: "coordinator-duty" }), 404);
  await expect("a tweet approves, even with a coordinator's name",
    post({ ...approve, source: "x", actor: "coordinator-duty" }, { key }), 403);
  await expect("scenario player approves as a coordinator",
    post({ ...approve, actor: "coordinator-duty" }, { key }), 200);

  // --- answers ---
  const answer = { type: "answer", source: "person", payload: { taskId: "check-task", result: "accepted", etaMinutes: 30 } };
  await expect("someone else answers the task", post(answer, { user: "volunteer-callback" }), 403);
  await expect("the assignee answers", post(answer, { user: "field-alpha" }), 200);

  // --- bad input ---
  await expect("shelter with more beds used than it has", post({
    type: "capacity", source: "person", payload: { shelter: "A", bedsUsed: 70, bedsTotal: 60 },
  }, { user: "shelter-desk" }), 400);
  await expect("unknown event type", post({ type: "launch", source: "person", payload: {} }, { user: "field-alpha" }), 400);
  await expect("broken JSON", post(null, { user: "field-alpha", raw: "{oops" }), 400);

  console.log(`\nAll ${passed} checks passed.`);
}

main()
  .catch((err) => {
    console.error("\nFAILED:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    const c = await cols();
    await c.events.deleteMany({ _id: { $in: created } });
    await c.tasks.deleteOne({ _id: "check-task" });
    await closeDb();
  });
