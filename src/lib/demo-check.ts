// Checks the global demo (D-0017): npm run demo:check. DEMO-1 (who may start, the only writer),
// DEMO-2 (the wipe), DEMO-3 (the stateless player) and DEMO-5 (the cast).
//
// startDemo() deletes EVERY desk's records, so this check refuses to run unless MONGODB_URI is a
// local Mongo (a throwaway container) or ALLOW_DEMO_WIPE=1. It needs db:seed's users and AGENT_KEY
// and DEMO_MODE=1 in .env.local. The player runs here with an injected clock and the real
// POST /api/events handler; scripts/fixtures/scenario-mini/ is the scenario.
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { POST as postEventRoute } from "../app/api/events/route";
import { POST as presenceRoute } from "../app/api/demo/presence/route";
import { POST as startRoute } from "../app/api/demo/start/route";
import { GET as boardRoute } from "../app/api/board/route";
import { runOnce } from "../workers/brain";
import { newPlayerState, tickOnce, type PlayerCtx } from "../workers/player";
import * as sweeper from "../workers/sweeper";
import { closeDb, cols, getDb } from "./db";
import { DEFAULT_T0, demoNow, demoNowFrom, demoSpeed, getDemo, isThrowawayMongo, startDemo } from "./demo";
import { configuredDeskId as deskId } from "./pilot";

const FIXTURE = join(import.meta.dirname, "..", "..", "scripts", "fixtures", "scenario-mini");
const A = "check-demo-a";
const B = "check-demo-b";
const KEY = process.env.AGENT_KEY ?? "";
let passed = 0;
const ok = (msg: string) => { passed++; console.log(`ok  ${msg}`); };

/** An injected clock for startDemo: sleeping moves it, nobody waits. */
function fakeClock(start = Date.now()) {
  let t = start;
  return { now: () => t, sleep: async (ms: number) => { t += ms; }, advance: (ms: number) => { t += ms; } };
}

async function askStart(opts: { user?: string; key?: string; body?: string } = {}) {
  const url = `http://localhost/api/demo/start${opts.user ? `?user=${opts.user}` : ""}`;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.key !== undefined) headers["x-agent-key"] = opts.key;
  const res = await startRoute(new Request(url, { method: "POST", headers, body: opts.body }));
  return { status: res.status, json: (await res.json()) as { runId?: string; startedAt?: string; error?: string } };
}

/** Every file that writes or even names the meta "demo" document, other than startDemo and the checks. */
async function otherDemoWriters(): Promise<string[]> {
  const root = join(import.meta.dirname, "..", "..");
  const found: string[] = [];
  for (const dir of ["src", "scripts"]) {
    let files: string[];
    try { files = (await readdir(join(root, dir), { recursive: true })) as string[]; } catch { files = [""]; }
    for (const f of files) {
      if (!/\.(ts|tsx|mjs|js)$/.test(f || dir)) continue;
      const rel = f ? join(dir, f) : dir;
      if (rel === join("src", "lib", "demo.ts") || /-check\.ts$/.test(rel) || rel.includes("node_modules")) continue;
      const src = await readFile(join(root, rel), "utf8");
      if (/_id:\s*["']demo["']/.test(src)) found.push(rel);
    }
  }
  return found;
}

async function wipeChecksData() {
  const c = await cols();
  const desks = { deskId: { $in: [A, B, deskId()] } };
  await Promise.all([
    c.events.deleteMany(desks), c.sites.deleteMany(desks), c.needs.deleteMany(desks), c.roads.deleteMany(desks),
    c.shelters.deleteMany(desks), c.zones.deleteMany(desks), c.incidents.deleteMany(desks), c.tasks.deleteMany(desks),
    c.inbox.deleteMany({}), c.messages.deleteMany({}),
    c.meta.deleteMany({ _id: { $in: ["demo", "check-demo-lease", `cases:${A}`, `cases:${B}`, `version:${A}`, `version:${B}`] } }),
    c.users.deleteMany({ _id: "check-demo-login" }),
  ]);
  await (await getDb()).collection("audit").deleteMany({ _id: "check-demo-audit" as never });
}

// ---------- DEMO-1 ----------
async function demo1() {
  assert.equal((await askStart()).status, 401, "nobody signed in");
  ok("401 nobody signed in");
  assert.equal((await askStart({ key: KEY })).status, 403, "agent key");
  ok("403 an agent key cannot start the demo");
  assert.equal((await askStart({ key: "nope" })).status, 401, "wrong agent key");
  ok("401 wrong agent key");
  assert.equal((await getDemo({ fresh: true })), null, "nothing written by the refused calls");
  ok("the refused calls wrote no demo document");

  process.env.DEMO_DEPLOYMENT = "0";
  try {
    assert.equal((await askStart({ user: "coordinator-duty" })).status, 403, "non-demo deployment");
  } finally { delete process.env.DEMO_DEPLOYMENT; }
  assert.equal((await getDemo({ fresh: true })), null);
  ok("403 a person on a non-demo deployment");

  assert.equal((await askStart({ user: "coordinator-duty", body: "{oops" })).status, 400);
  assert.equal((await askStart({ user: "coordinator-duty", body: JSON.stringify({ durationS: 5 }) })).status, 400);
  assert.equal((await askStart({ user: "coordinator-duty", body: JSON.stringify({ durationS: 9000 }) })).status, 400);
  assert.equal((await getDemo({ fresh: true })), null);
  ok("400 bad body and durationS outside 60..7200, nothing written");

  const r = await askStart({ user: "coordinator-duty", body: JSON.stringify({ durationS: 600 }) });
  assert.equal(r.status, 200);
  assert(r.json.runId && r.json.startedAt && !Number.isNaN(Date.parse(r.json.startedAt)));
  const doc = await getDemo({ fresh: true });
  assert(doc?.state === "playing" && doc.runId === r.json.runId && doc.durationS === 600);
  ok(`200 a person starts it: runId ${r.json.runId}, durationS 600`);

  const r2 = await askStart({ user: "volunteer-callback" });
  assert.equal(r2.status, 200);
  assert.notEqual(r2.json.runId, r.json.runId);
  assert.equal(((await getDemo({ fresh: true })) as { durationS: number }).durationS, 1800);
  ok("200 pressing it again restarts: a new runId, default durationS 1800");

  const others = await otherDemoWriters();
  assert.deepEqual(others, [], `only lib/demo.ts may touch meta "demo": ${others.join(", ")}`);
  ok('no file but lib/demo.ts (and checks) names meta _id "demo"');

  const clock = demoNowFrom({ state: "playing", runId: "r", startedAt: new Date(1_000_000), durationS: 1800 }, 1_000_000 + 25_000);
  assert.equal(clock.getTime(), Date.parse(DEFAULT_T0) + 25_000 * demoSpeed(1800));
  assert.equal(demoNowFrom(null, 5000).getTime(), 5000);
  ok("demoNow: T0 + elapsed x 72 while playing, real time with no document");

  await wipeChecksData();
}

// ---------- DEMO-2 ----------
async function demo2() {
  const c = await cols();
  const db = await getDb();
  const now = new Date();
  for (const desk of [A, B]) {
    await c.events.insertOne({ _id: `${desk}-ev`, deskId: desk, ts: now, observedAt: now, type: "report", source: "x", actor: "x-agent", lane: 1,
      payload: { kind: "trapped", text: "t", textEn: "t" }, status: "applied", attempts: 1, dedupeKey: `check-demo:${desk}` } as never);
    await c.sites.insertOne({ _id: `${desk}-site`, deskId: desk } as never);
    await c.needs.insertOne({ _id: `${desk}-need`, deskId: desk } as never);
    await c.roads.insertOne({ _id: `${desk}-road`, deskId: desk } as never);
    await c.shelters.insertOne({ _id: `${desk}-shelter`, deskId: desk } as never);
    await c.zones.insertOne({ _id: `${desk}-zone`, deskId: desk } as never);
    await c.incidents.insertOne({ _id: `${desk}-inc`, deskId: desk } as never);
    await c.tasks.insertOne({ _id: `${desk}-task`, deskId: desk } as never);
    await c.inbox.insertOne({ _id: `${desk}-inbox`, userId: "volunteer-callback", message: "m", status: "unread", ts: now, kind: "notice", priority: 0 } as never);
    await c.messages.insertOne({ _id: `${desk}-msg`, userId: "volunteer-callback", from: "user", text: "hi", ts: now } as never);
    await c.meta.insertOne({ _id: `cases:${desk}`, version: 7 });
    await c.meta.insertOne({ _id: `version:${desk}`, version: 9 });
  }
  const lease = { _id: "check-demo-lease", holder: "someone-else:1", until: new Date(Date.now() + 3_600_000) };
  await c.meta.insertOne(lease);
  const realLease = await c.meta.findOne({ _id: "brain-lease" });
  const audit = db.collection<{ _id: string; what: string; ts: Date }>("audit");
  const auditRow = { _id: "check-demo-audit", what: "someone did something", ts: now };
  await audit.insertOne(auditRow);
  // A login: a person who is not in the seed. Reseeding must leave them alone.
  await c.users.insertOne({ _id: "check-demo-login", name: "Login", role: "public", region: "r", status: "offline", deskId: deskId(), trust: "public" });
  // A seeded person who has moved: reseeding puts them back.
  await c.users.updateOne({ _id: "volunteer-callback" }, { $set: { status: "offline", coords: [1, 1] } });

  const clock = fakeClock();
  const run = await startDemo({ now: clock.now, sleep: clock.sleep });

  for (const [name, col] of Object.entries({
    events: c.events, sites: c.sites, needs: c.needs, roads: c.roads, shelters: c.shelters, zones: c.zones,
    incidents: c.incidents, tasks: c.tasks,
  })) {
    assert.equal(await (col as { countDocuments(f: object): Promise<number> }).countDocuments({ deskId: { $in: [A, B] } }), 0, `${name} on both desks`);
  }
  assert.equal(await c.inbox.countDocuments({ _id: { $in: [`${A}-inbox`, `${B}-inbox`] } as never }), 0);
  assert.equal(await c.messages.countDocuments({ _id: { $in: [`${A}-msg`, `${B}-msg`] } as never }), 0);
  assert.equal(await c.meta.countDocuments({ _id: { $in: [`cases:${A}`, `cases:${B}`, `version:${A}`, `version:${B}`] } }), 0);
  assert.equal(await c.events.countDocuments({}), 0, "every desk");
  ok("both desks' events, sites, needs, roads, shelters, zones, incidents, tasks, inbox, messages and counters are gone");

  const callback = await c.users.findOne({ _id: "volunteer-callback" });
  assert.equal(callback?.status, "available");
  assert.notDeepEqual(callback?.coords, [1, 1]);
  ok("seeded users are reseeded from data/seed.json");
  assert(await c.users.findOne({ _id: "check-demo-login" }), "a login that is not in the seed survives");
  ok("a user outside the seed (a login) is untouched");

  assert.deepEqual(await c.meta.findOne({ _id: "check-demo-lease" }), lease);
  assert.deepEqual(await c.meta.findOne({ _id: "brain-lease" }), realLease);
  assert.deepEqual(await audit.findOne({ _id: "check-demo-audit" }), auditRow);
  ok("the Brain lease and an audit row are unchanged");

  const doc = await getDemo({ fresh: true });
  assert(doc?.state === "playing" && doc.runId === run.runId && doc.startedAt.getTime() === run.startedAt.getTime());
  ok("meta demo is playing with the new runId");

  // Waits up to waitMs for events the Brain is working on, then wipes anyway.
  await c.events.insertOne({ _id: "check-demo-working", deskId: A, ts: now, observedAt: now, type: "report", source: "x", actor: "x-agent",
    lane: 1, payload: { kind: "trapped", text: "t", textEn: "t" }, status: "working", lockedAt: now, attempts: 1 } as never);
  const slow = fakeClock();
  const t0 = slow.now();
  await startDemo({ now: slow.now, sleep: slow.sleep });
  assert(slow.now() - t0 >= 10_000, "waited 10 s for a working event");
  assert.equal(await c.events.countDocuments({ _id: "check-demo-working" as never }), 0);
  ok("waits up to 10 s for a working event, then wipes");

  // The Brain does nothing while prepping.
  await c.meta.replaceOne({ _id: "demo" }, { state: "prepping" }, { upsert: true });
  await getDemo({ fresh: true });
  await c.events.insertOne({ _id: "check-demo-pending", deskId: A, ts: new Date(), observedAt: new Date(), type: "report", source: "x", actor: "x-agent",
    lane: 1, payload: { kind: "trapped", text: "t", textEn: "t" }, status: "pending", attempts: 0 } as never);
  assert.equal(await runOnce({ deskId: A }), false, "the Brain takes nothing");
  assert.equal((await c.events.findOne({ _id: "check-demo-pending" as never }))?.status, "pending");
  const swept = await sweeper.tick(new Date(), { deskId: A });
  assert.equal(Object.values(swept).reduce((a, b) => a + b, 0), 0, "the sweeper does nothing");
  await c.meta.deleteOne({ _id: "demo" });
  await getDemo({ fresh: true });
  assert.equal(await runOnce({ deskId: A }), true, "and takes it once the demo is not prepping");
  ok("the Brain and the sweeper do nothing while prepping");

  // The board carries the demo state and a fresh clock.
  const run3 = await startDemo({ now: fakeClock().now, sleep: async () => {} });
  const res = await boardRoute(new Request(`http://localhost/api/board?user=coordinator-duty`));
  const board = (await res.json()) as { demo: { state: string; durationS: number } | null; demoNow: string; sites: unknown[] };
  assert.equal(board.demo?.state, "playing");
  assert(!Number.isNaN(Date.parse(board.demoNow)) && Array.isArray(board.sites));
  assert(run3.runId);
  ok("GET /api/board carries demo and demoNow");
  await wipeChecksData();
}

// ---------- DEMO-3 and DEMO-5 ----------
/** Posts through the real POST /api/events handler with the agent key, and records what was sent. */
function playerCtx(sent: string[], dir = FIXTURE): PlayerCtx {
  return {
    dir, state: newPlayerState(),
    presence: async (dark) => {
      const res = await presenceRoute(new Request("http://localhost/api/demo/presence", {
        method: "POST", headers: { "content-type": "application/json", "x-agent-key": KEY }, body: JSON.stringify({ dark }),
      }));
      if (!res.ok) throw new Error(`presence ${res.status}`);
      return res.json();
    },
    post: async (body) => {
      sent.push(String(body.dedupeKey));
      const res = await postEventRoute(new Request("http://localhost/api/events", {
        method: "POST", headers: { "content-type": "application/json", "x-agent-key": KEY }, body: JSON.stringify(body),
      }));
      if (!res.ok) throw new Error(`POST /api/events ${res.status} ${await res.text()}`);
      return res.json();
    },
  };
}

async function drain() { while (await runOnce()) { /* the Brain applies everything queued */ } }

async function demo3and5() {
  const c = await cols();
  const clock = fakeClock();
  const DUR = 60; // 2160x: scenario second s is s/2160 real seconds
  const at = (startedAt: Date, sec: number) => startedAt.getTime() + (sec / demoSpeed(DUR)) * 1000;

  const run1 = await startDemo({ durationS: DUR, now: clock.now, sleep: clock.sleep });
  const sent: string[] = [];
  const ctx = playerCtx(sent);
  assert.deepEqual(await tickOnce(at(run1.startedAt, 5), ctx), { posted: 0, skipped: 0, waiting: 0 });
  assert.equal(sent.length, 0);
  ok("nothing is due at scenario second 5");
  const t1 = await tickOnce(at(run1.startedAt, 16), ctx);
  assert.equal(t1.posted, 2);
  assert.deepEqual(sent, [`x:mini-1:${run1.runId}`, `ap:mini-1:${run1.runId}`]);
  ok("lines due by second 16 post once, in atS order (x 10, ap 15)");
  assert.equal((await tickOnce(at(run1.startedAt, 16.5), ctx)).posted, 0);
  assert.equal(sent.length, 2);
  ok("a second tick at the same time posts nothing new");
  const t2 = await tickOnce(at(run1.startedAt, 100), ctx);
  assert.equal(t2.posted, 1);
  assert.equal(t2.waiting, 1, "the cast line waits: the Brain has not made a task yet");
  assert.deepEqual(sent.slice(2), [`x:mini-2:${run1.runId}`]);
  ok("x 20 posts; the cast line (30) waits for its task");

  // A player restart: a new state posts the same lines again, and dedupe absorbs them.
  const before = await c.events.countDocuments({});
  const restarted = playerCtx([]);
  const t3 = await tickOnce(at(run1.startedAt, 100), restarted);
  assert.equal(t3.posted, 3);
  assert.equal(await c.events.countDocuments({}), before, "the queue took no new event");
  ok("a restarted player re-posts, and the queue absorbs every line (dedupeKey)");

  // --- DEMO-5: nobody acted, so the cast line posts as the assignee ---
  await drain();
  const siteEv = await c.events.findOne({ dedupeKey: `x:mini-1:${run1.runId}` });
  assert(siteEv?.result?.recordIds.length, `the Brain applied the x line: ${JSON.stringify(siteEv?.result)}`);
  const task = await c.tasks.findOne({ recordId: { $in: siteEv.result!.recordIds } }, { sort: { _id: -1 } });
  assert(task?.assignee, `the dispatcher picked someone: ${JSON.stringify(task)}`);
  const t4 = await tickOnce(at(run1.startedAt, 110), ctx);
  assert.equal(t4.posted, 1, "the cast line posts now");
  const cast = await c.events.findOne({ dedupeKey: `cast:0:${run1.runId}` });
  assert(cast, "the cast event is in the queue");
  assert.equal(cast.actor, task.assignee);
  assert.equal(cast.source, "person");
  assert.equal(cast.type, "answer");
  assert.equal((cast.payload as { taskId: string }).taskId, task._id);
  ok(`the cast line acts as the assignee (${task.assignee}) on task ${task._id}`);
  await drain();
  assert.equal((await c.tasks.findOne({ _id: task._id }))?.status, "accepted");
  ok("the Brain applied it: the task is accepted");

  // --- Pressing Start again: a fresh runId and a fresh set ---
  const run2 = await startDemo({ durationS: DUR, now: clock.now, sleep: clock.sleep });
  assert.notEqual(run2.runId, run1.runId);
  assert.equal(await c.events.countDocuments({}), 0);
  const t5 = await tickOnce(at(run2.startedAt, 100), ctx); // same ctx, same state object: the run id changed
  assert.equal(t5.posted, 3);
  const keys = (await c.events.find({}).toArray()).map((e) => e.dedupeKey).sort();
  assert.deepEqual(keys, [`ap:mini-1:${run2.runId}`, `x:mini-1:${run2.runId}`, `x:mini-2:${run2.runId}`].sort());
  ok("a new start gives a fresh runId and a fresh set of lines");

  // --- DEMO-5: a signed-in person acts first, so the cast line is skipped ---
  await drain();
  const siteEv2 = await c.events.findOne({ dedupeKey: `x:mini-1:${run2.runId}` });
  const task2 = await c.tasks.findOne({ recordId: { $in: siteEv2!.result!.recordIds } }, { sort: { _id: -1 } });
  assert(task2?.assignee);
  const res = await postEventRoute(new Request(`http://localhost/api/events?user=${task2.assignee}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "answer", source: "person", payload: { taskId: task2._id, result: "accepted", etaMinutes: 5 } }),
  }));
  assert.equal(res.status, 200, "the presenter taps for the assignee");
  const sentAfter = sent.length;
  const t6 = await tickOnce(at(run2.startedAt, 120), ctx);
  assert.equal(t6.skipped, 1);
  assert.equal(sent.length, sentAfter, "nothing posted");
  assert.equal(await c.events.countDocuments({ dedupeKey: { $regex: /^cast:/ } }), 0);
  ok("a signed-in person acted first: the cast line is skipped and posts nothing");
  assert.equal((await tickOnce(at(run2.startedAt, 130), ctx)).skipped, 0, "and it is not tried again");
  ok("a skipped line is not retried");

  // --- DEMO-5: a cast line whose task never appears is dropped after 10 scenario minutes ---
  const run3 = await startDemo({ durationS: DUR, now: clock.now, sleep: clock.sleep });
  const lines: string[] = [];
  const lateCtx = { ...playerCtx([]), log: (m: string) => lines.push(m) };
  await tickOnce(at(run3.startedAt, 100), lateCtx);
  assert.equal((await tickOnce(at(run3.startedAt, 30 + 599), lateCtx)).waiting, 1);
  const t7 = await tickOnce(at(run3.startedAt, 30 + 601), lateCtx);
  assert.equal(t7.skipped, 1);
  assert(lines.some((l) => /no task after 10 scenario minutes/.test(l)));
  ok("a cast line with no task is dropped after 10 scenario minutes, with a log line");
}

// ---------- cast conventions: @record references, task type and status ----------
async function demoRefs() {
  const c = await cols();
  const clock = fakeClock();
  const DUR = 60;
  const at = (startedAt: Date, sec: number) => startedAt.getTime() + (sec / demoSpeed(DUR)) * 1000;
  const run = await startDemo({ durationS: DUR, now: clock.now, sleep: clock.sleep });
  const sent: string[] = [];
  const ctx = playerCtx(sent, join(import.meta.dirname, "..", "..", "scripts", "fixtures", "scenario-refs"));
  const castKeys = async () => (await c.events.find({ dedupeKey: { $regex: /^cast:/ } }).toArray()).map((e) => e.dedupeKey).sort();

  assert.equal((await tickOnce(at(run.startedAt, 100), ctx)).posted, 1, "the x line posts; every cast line waits for it");
  assert.deepEqual(await castKeys(), []);
  ok("cast lines wait while the source record does not exist yet");

  await drain();
  const siteId = (await c.events.findOne({ dedupeKey: `x:ref-1:${run.runId}` }))!.result!.recordIds[0];
  const t2 = await tickOnce(at(run.startedAt, 101), ctx);
  assert.equal(t2.posted, 2, "the call-type accept and the @record correction post");
  const [b, cEv] = [await c.events.findOne({ dedupeKey: `cast:1:${run.runId}` }), await c.events.findOne({ dedupeKey: `cast:2:${run.runId}` })];
  assert.equal(b?.type, "answer"); assert.equal(cEv?.type, "correction");
  assert.equal((cEv!.payload as { recordId: string }).recordId, siteId, "@record:x:ref-1 became the site id");
  ok(`"@record:<dedupeKey>" in a payload resolves to the record that source line made (${siteId})`);
  assert.equal(await c.events.countDocuments({ dedupeKey: { $in: [`cast:0:${run.runId}`, `cast:3:${run.runId}`] } }), 0);
  ok("task type narrows: a rescue line and a status:blocked line keep waiting while only an open call task exists");

  await drain();
  assert((await c.events.findOne({ dedupeKey: `cast:2:${run.runId}` }))?.result?.recordIds?.length, "the keeper applied the correction");
  const lastSeen = async (id: string) => (await c.users.findOne({ _id: id }))!.lastSeen!.getTime();
  const [zBefore, bBefore] = [await lastSeen("volunteer-callback"), await lastSeen("volunteer-mechanic")];
  await new Promise((r) => setTimeout(r, 20));
  assert.equal((await tickOnce(at(run.startedAt, 102), ctx)).posted, 1);
  assert.equal(await lastSeen("volunteer-callback"), zBefore, "go_dark: the dark person is no longer stamped");
  assert((await lastSeen("volunteer-mechanic")) > bBefore, "everyone else still is");
  ok("the player's presence call stamps the seeded people each tick; a go_dark line stops it for that person");
  // DEMO-4: the stamp is on the demo clock, which is what the dispatcher compares it with.
  const sinceStamp = Math.abs((await lastSeen("volunteer-mechanic")) - (await demoNow()).getTime());
  assert(sinceStamp < 300_000, `lastSeen is demoNow() (off by ${sinceStamp} ms), not real time`);
  ok("DEMO-4: POST /api/demo/presence stamps lastSeen = demoNow()");
  const e = await c.events.findOne({ dedupeKey: `cast:4:${run.runId}` });
  assert.equal((e!.payload as { recordId: string }).recordId, siteId);
  ok('"@record:<cast line id>" resolves to what that cast line made');
}

async function main() {
  assert(isThrowawayMongo(), "demo:check wipes every desk: run it against a local Mongo, or set ALLOW_DEMO_WIPE=1");
  assert(KEY, "set AGENT_KEY in .env.local");
  assert.equal(process.env.DEMO_MODE, "1", "set DEMO_MODE=1 in .env.local");
  assert.equal(process.env.DEMO_DEPLOYMENT, undefined, "unset DEMO_DEPLOYMENT");
  const c = await cols();
  assert(await c.users.findOne({ _id: "coordinator-duty" }), "run npm run db:seed first");
  await wipeChecksData();
  await demo1();
  await demo2();
  await demo3and5();
  await demoRefs();
  console.log(`\nAll ${passed} checks passed.`);
}

main()
  .catch((err) => {
    console.error("\nFAILED:", err instanceof Error ? err.stack ?? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      const c = await cols();
      await c.events.deleteMany({});
      await wipeChecksData();
      await c.meta.deleteMany({ _id: { $regex: /^(cases|version):/ } });
    } finally {
      await closeDb();
    }
  });
