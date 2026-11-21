// Checks POST /api/events without starting Next: calls the route handler directly.
// Also checks that lib/openapi.ts lists exactly the routes in app/api, with the same methods.
// Run: npm run api:check (needs npm run db:seed first, and AGENT_KEY + DEMO_MODE=1 in .env.local).
// Creates one test task and some events, and deletes all of them at the end.
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { POST } from "../app/api/events/route";
import { GET as getInbox, POST as postInbox } from "../app/api/inbox/route";
import { POST as startDemoRoute } from "../app/api/demo/start/route";
import { GET as getUsers } from "../app/api/users/route";
import { closeDb, cols } from "./db";
import { isThrowawayMongo } from "./demo";
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
// Everything this check writes goes to its own desk, so the shared board never shows it,
// even for a moment, and a running Brain cannot turn it into a site on the real desk.
const DESK = "check-api";

async function post(body: unknown, opts: { user?: string; key?: string; raw?: string } = {}) {
  const url = opts.user ? `${BASE}?user=${opts.user}` : BASE;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.key !== undefined) headers["x-agent-key"] = opts.key;
  const withDesk = body && typeof body === "object" && !Array.isArray(body) ? { deskId: DESK, ...body } : body;
  const res = await POST(new Request(url, { method: "POST", headers, body: opts.raw ?? JSON.stringify(withDesk) }));
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

/** Calls a GET or POST handler directly, for the inbox and users cases. */
async function call(
  handler: (req: Request) => Promise<Response>, path: string,
  opts: { user?: string; key?: string; body?: string; method?: "GET" | "POST" } = {},
) {
  const url = new URL(`http://localhost${path}`);
  if (opts.user) url.searchParams.set("user", opts.user);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.key !== undefined) headers["x-agent-key"] = opts.key;
  const res = await handler(new Request(url, { method: opts.method ?? "GET", headers, body: opts.body }));
  return { status: res.status, json: (await res.json()) as unknown };
}

async function expectCall(name: string, p: ReturnType<typeof call>, status: number) {
  const r = await p;
  const error = (r.json as { error?: string } | null)?.error;
  assert.equal(r.status, status, `${name}: expected ${status}, got ${r.status} ${error ?? ""}`);
  passed++;
  console.log(`ok  ${status}  ${name}${error ? `  (${error})` : ""}`);
  return r.json;
}

// Throwaway people on the throwaway desk, so the inbox and users cases never touch a seeded user.
const PERSON = "check-person";
const OTHER = "check-other";

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
    title: "check", detail: "check", deadline: new Date(), history: [], deskId: DESK,
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
  assert.equal(rev?.lane, 0); assert.equal(rev?.deskId, DESK);
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

  // --- inbox (#1) ---
  const ago = (s: number) => new Date(Date.now() - s * 1000);
  await c.users.deleteMany({ _id: { $in: [PERSON, OTHER] } });
  await c.users.insertMany([
    { _id: PERSON, name: "Check person", role: "volunteer", region: "check", status: "offline", deskId: DESK,
      trust: "public", coords: [38.35, 38.31], profile: { stock: { blankets: 5 }, notes: "secret" } },
    { _id: OTHER, name: "Check other", role: "public", region: "check", status: "offline", deskId: DESK, trust: "public" },
  ]);
  await c.inbox.deleteMany({ userId: { $in: [PERSON, OTHER] } });
  await c.inbox.insertMany([
    { _id: "check-inbox-old", userId: PERSON, message: "old", status: "unread", ts: ago(60), kind: "notice", priority: 0 },
    { _id: "check-inbox-new", userId: PERSON, message: "new", status: "unread", ts: ago(1), kind: "task", priority: 0 },
    { _id: "check-inbox-read", userId: PERSON, message: "read", status: "read", ts: ago(30), kind: "notice", priority: 0 },
    { _id: "check-inbox-other", userId: OTHER, message: "not yours", status: "unread", ts: ago(5), kind: "notice", priority: 0 },
  ]);

  await expectCall("agent reads an inbox", call(getInbox, "/api/inbox", { key }), 400);
  await expectCall("nobody signed in reads an inbox", call(getInbox, "/api/inbox"), 401);
  const before = new Date();
  const unread = (await expectCall("person reads their inbox", call(getInbox, "/api/inbox", { user: PERSON }), 200)) as { _id: string }[];
  assert.deepEqual(unread.map((i) => i._id), ["check-inbox-new", "check-inbox-old"], "unread only, newest first, own only");
  const seen = await c.users.findOne({ _id: PERSON });
  assert(seen?.lastSeen instanceof Date && seen.lastSeen >= before, "GET stamps lastSeen");
  console.log("    unread only, newest first, nobody else's, lastSeen stamped");

  const mark = (body: unknown, user = PERSON) =>
    call(postInbox, "/api/inbox", { user, method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });
  const own = (await expectCall("person marks one item read", mark({ ids: ["check-inbox-old"] }), 200)) as { read: number };
  assert.equal(own.read, 1);
  const theirs = (await expectCall("person marks someone else's item read", mark({ ids: ["check-inbox-other"] }), 200)) as { read: number };
  assert.equal(theirs.read, 0, "only the caller's own items change");
  assert.equal((await c.inbox.findOne({ _id: "check-inbox-other" }))?.status, "unread");
  await expectCall("ids is not a list of strings", mark({ ids: [1, 2] }), 400);
  await expectCall("broken JSON to the inbox", mark("{oops"), 400);
  await expectCall("agent marks an inbox read", call(postInbox, "/api/inbox", { key, method: "POST", body: "{}" }), 400);
  const all = (await expectCall("person marks everything read (empty body)", mark(""), 200)) as { read: number };
  assert.equal(all.read, 1);
  assert.deepEqual(await expectCall("inbox is empty after", call(getInbox, "/api/inbox", { user: PERSON }), 200), []);
  console.log("    { read: n } counts only the caller's unread items");

  // --- users (#2) ---
  const people = (await expectCall("coordinator reads the people list",
    call(getUsers, `/api/users?desk=${DESK}`, { user: "coordinator-duty" }), 200)) as Record<string, unknown>[];
  assert.deepEqual(people.map((u) => u._id), [OTHER, PERSON], "this desk's users, by name");
  for (const u of people) assert(!("profile" in u) && !("trust" in u) && !("deskId" in u), `${u._id}: only the listed fields`);
  assert.deepEqual(Object.keys(people[1]).sort(), ["_id", "coords", "lastSeen", "name", "region", "role", "status"]);
  console.log("    _id, name, role, region, status, coords, lastSeen. No profile");
  await expectCall("volunteer reads the people list", call(getUsers, `/api/users?desk=${DESK}`, { user: "volunteer-callback" }), 200);
  await expectCall("agent reads the people list", call(getUsers, `/api/users?desk=${DESK}`, { key }), 200);
  await expectCall("citizen reads the people list", call(getUsers, `/api/users?desk=${DESK}`, { user: "public-demo" }), 403);
  await expectCall("nobody signed in reads the people list", call(getUsers, "/api/users"), 401);
  const seeded = (await expectCall("people list of the real desk",
    call(getUsers, "/api/users", { user: "coordinator-duty" }), 200)) as Record<string, unknown>[];
  assert(seeded.length >= 9 && seeded.every((u) => !("profile" in u)), "the seeded people, without profile");
  console.log(`    ${seeded.length} people on the real desk, none with profile`);

  // --- start demo (DEMO-1). Last, because a successful start deletes every desk's records. ---
  const start = (opts: { user?: string; key?: string; body?: string } = {}) =>
    call(startDemoRoute, "/api/demo/start", { ...opts, method: "POST" });
  await expectCall("nobody signed in starts the demo", start(), 401);
  await expectCall("agent key starts the demo", start({ key }), 403);
  process.env.DEMO_DEPLOYMENT = "0";
  try {
    await expectCall("a person starts the demo on a non-demo deployment", start({ user: "coordinator-duty" }), 403);
  } finally { delete process.env.DEMO_DEPLOYMENT; }
  await expectCall("durationS under 60", start({ user: "coordinator-duty", body: JSON.stringify({ durationS: 10 }) }), 400);
  if (isThrowawayMongo()) {
    const run = (await expectCall("a person starts the demo (durationS 60)",
      start({ user: "coordinator-duty", body: JSON.stringify({ durationS: 60 }) }), 200)) as { runId: string; startedAt: string };
    assert(run.runId && !Number.isNaN(Date.parse(run.startedAt)));
    const doc = await c.meta.findOne({ _id: "demo" });
    assert.equal(doc?.state, "playing"); assert.equal(doc?.runId, run.runId); assert.equal(doc?.durationS, 60);
    console.log("    meta demo: playing, the new runId, durationS 60");
  } else {
    console.log("skip  a person starts the demo: it deletes every desk, so it runs on a local Mongo (or ALLOW_DEMO_WIPE=1) only");
  }

  console.log(`\nAll ${passed} checks passed.`);
}

main()
  .catch((err) => {
    console.error("\nFAILED:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    const c = await cols();
    await c.events.deleteMany({ $or: [{ _id: { $in: created } }, { deskId: DESK }] });
    await c.sites.deleteMany({ deskId: DESK }); // a running Brain may have made one from the test report
    await c.tasks.deleteOne({ _id: "check-task" });
    await c.meta.deleteOne({ _id: "demo" }); // only exists when the start-demo case ran
    await c.inbox.deleteMany({ userId: { $in: [PERSON, OTHER] } });
    await c.users.deleteMany({ _id: { $in: [PERSON, OTHER] }, deskId: DESK });
    await closeDb();
  });
