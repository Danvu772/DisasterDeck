// check:scenario (D-0017 §6 and amendment 6, issue #53): plays data/scenarios/antakya-demo through the
// real stack on VIRTUAL time and asserts every beat of beats.json. Run: npm run check:scenario
//
// It wipes every desk (startDemo), so it runs only against a local Mongo (a throwaway container) or
// with ALLOW_DEMO_WIPE=1. Needs db:seed's users, AGENT_KEY and DEMO_MODE=1 in .env.local.
//
// Virtual time without a hook in production code: after startDemo() the check rewrites the `demo`
// document to { durationS: 129600 (SCENARIO_SPAN_S), startedAt: realNow - V }. The demo speed is then
// exactly 1 (scenario second per real second), so demoNow()/demoNowSync() = T0 + V (plus the few real
// milliseconds a step takes), the player's scenarioSecond() = V, and event receive times (real) map to
// V through demoAtSync(). Nothing sleeps. demo.ts, db.ts and the workers are unchanged.
//
// For each line, in atS order: set V; stamp presence; post the line through the player's own
// tickOnce() (the real POST /api/events handler and the player's cast resolution), with the player's
// line list cut to the lines played so far so a tick never runs ahead of the beat; drain the Brain
// (lane 0 first) until nothing is pending; tick the sweeper (at = V) every 30 virtual seconds between
// lines. After a beat's afterLine (plus its settleS) its `expect` is evaluated.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { POST as postEventRoute } from "../app/api/events/route";
import { POST as presenceRoute } from "../app/api/demo/presence/route";
import { runOnce } from "../workers/brain";
import { loadScenario, newPlayerState, tickOnce, type Line, type PlayerCtx } from "../workers/player";
import * as sweeper from "../workers/sweeper";
import { closeDb, cols } from "./db";
import { demoT0, getDemo, isThrowawayMongo, SCENARIO_SPAN_S, startDemo } from "./demo";
import { seed } from "./seed";

type Json = Record<string, unknown>;
const DIR = join(import.meta.dirname, "..", "..", "data", "scenarios", "antakya-demo");
const KEY = process.env.AGENT_KEY ?? "";
const SWEEP_EVERY_S = 30;
/** The Brain and the dispatcher log every event; that would drown the beat lines. SCENARIO_VERBOSE=1 shows it. */
const quiet = !process.env.SCENARIO_VERBOSE;
const realLog = console.log.bind(console);
console.log = (...a: unknown[]) => { if (!(quiet && typeof a[0] === "string" && /^\[(brain|dispatcher|keeper|sweeper)\b/.test(a[0]))) realLog(...a); };
/** SCENARIO_UNTIL=<n> stops after beat n (debugging). */
const UNTIL = process.env.SCENARIO_UNTIL === undefined ? Infinity : Number(process.env.SCENARIO_UNTIL);

interface Beat { beat: number; name: string; afterLine: string | null; settleS?: number; shows: string; expect: Json[] }

// ---------- virtual clock ----------
const T0 = demoT0();
let V = 0; // scenario seconds

/** Make the desk clock read T0 + sec (speed 1, see the header). Returns the real ms that equals `sec`. */
async function setV(sec: number): Promise<number> {
  V = Math.max(V, sec);
  const { meta } = await cols();
  const startedAt = new Date(Date.now() - V * 1000);
  await meta.updateOne({ _id: "demo" }, { $set: { startedAt, durationS: SCENARIO_SPAN_S } });
  await getDemo({ fresh: true });
  return startedAt.getTime() + V * 1000;
}

// ---------- the world: the real handlers ----------
async function presence(d: string[]) {
  const res = await presenceRoute(new Request("http://localhost/api/demo/presence", {
    method: "POST", headers: { "content-type": "application/json", "x-agent-key": KEY }, body: JSON.stringify({ dark: d }),
  }));
  if (!res.ok) throw new Error(`presence ${res.status}`);
  return res.json();
}

const ctx: PlayerCtx = {
  dir: DIR, state: newPlayerState(), presence,
  post: async (body) => {
    const res = await postEventRoute(new Request("http://localhost/api/events", {
      method: "POST", headers: { "content-type": "application/json", "x-agent-key": KEY }, body: JSON.stringify(body),
    }));
    if (!res.ok) throw new Error(`POST /api/events ${res.status} ${await res.text()}`);
    return res.json();
  },
  log: (m) => { if (process.env.SCENARIO_VERBOSE) console.log(`    [player] ${m}`); },
};

async function drain() {
  let n = 0;
  while (await runOnce()) { if (++n > 5000) throw new Error("the Brain does not settle"); }
}

/** Stamp presence, tick the sweeper at the current V, let the Brain finish what it posted. */
async function sweepNow() {
  await setV(V);
  await presence([...ctx.state.dark]);
  await sweeper.tick(new Date(T0 + V * 1000));
  await drain();
}

/** Move virtual time forward to `sec`, sweeping every 30 virtual seconds. */
async function advanceTo(sec: number) {
  while (V + SWEEP_EVERY_S <= sec) {
    V += SWEEP_EVERY_S;
    await sweepNow();
  }
  if (sec > V) V = sec;
}

/** Play one line (and every earlier cast line still waiting for its task) through the player. */
async function playLine(lines: Line[], upTo: number, atS: number) {
  ctx.state.lines = lines.slice(0, upTo + 1);
  const nowMs = await setV(atS);
  await tickOnce(nowMs, ctx);
  await drain();
  // A cast line that was waiting for a task the Brain has just made: one more pass.
  await tickOnce(await setV(V), ctx);
  await drain();
}

// ---------- expectations ----------
const fmt = (v: unknown) => (v instanceof Date ? v.toISOString() : JSON.stringify(v));
const pick = (o: Json, k: string): unknown => k.split(".").reduce<unknown>((x, p) => (x && typeof x === "object" ? (x as Json)[p] : undefined), o);

/** One field test: a scalar (deep equal), { in: [...] } or { gte: n }. */
function fieldOk(actual: unknown, want: unknown): boolean {
  if (want && typeof want === "object" && !Array.isArray(want)) {
    const w = want as { in?: unknown[]; gte?: number };
    if (w.in) return w.in.some((x) => JSON.stringify(x) === JSON.stringify(actual));
    if (typeof w.gte === "number") return typeof actual === "number" && actual >= w.gte;
  }
  return JSON.stringify(actual) === JSON.stringify(want);
}

function isOk(rec: Json | null | undefined, is: Json): { ok: boolean; seen: string } {
  if (!rec) return { ok: false, seen: "no such record" };
  const bad = Object.entries(is).filter(([k, w]) => !fieldOk(pick(rec, k), w));
  const seen = Object.keys(is).map((k) => `${k}=${fmt(pick(rec, k))}`).join(" ");
  return { ok: bad.length === 0, seen: bad.length ? bad.map(([k, w]) => `${k}=${fmt(pick(rec, k))} (wanted ${fmt(w)})`).join("; ") : seen };
}

/** The record ids an event (a source line's or a cast line's dedupeKey, without the run id) produced. */
async function idsFrom(key: string, runId: string): Promise<string[]> {
  const { events } = await cols();
  const ev = await events.findOne({ dedupeKey: { $in: [`${key}:${runId}`] } }, { projection: { result: 1 } });
  return ev?.result?.recordIds ?? [];
}

async function evalExpect(e: Json, runId: string): Promise<{ ok: boolean; text: string }> {
  const c = (await cols()) as unknown as Record<string, { find(f: object, o?: object): { toArray(): Promise<Json[]> }; countDocuments(f: object): Promise<number> }>;
  const [op, v] = Object.entries(e)[0] as [string, Json];
  if (op === "count") {
    const n = await c[String(v.coll)].countDocuments(v.where as object);
    const ok = "eq" in v ? n === v.eq : n >= (v.gte as number);
    return { ok, text: `${v.coll} ${fmt(v.where)} count ${n}, wanted ${"eq" in v ? `= ${v.eq}` : `>= ${v.gte}`}` };
  }
  if (op === "event") {
    const ev = (await c.events.find({ dedupeKey: `${v.key}:${runId}` }).toArray())[0];
    const ok = ev?.status === v.status;
    return { ok, text: `event ${v.key} is ${ev ? String(ev.status) : "missing"}${ev?.result ? ` (${(ev.result as Json).reason})` : ""}, wanted ${v.status}` };
  }
  if (op === "record") {
    const ids = await idsFrom(String(v.from), runId);
    const recs = await c[String(v.coll)].find({ _id: { $in: ids } }).toArray();
    const r = isOk(recs[0], v.is as Json);
    return { ok: r.ok, text: `${v.coll} from ${v.from}: ${r.seen}` };
  }
  if (op === "task") {
    const ids = await idsFrom(String(v.from), runId);
    const tasks = await c.tasks.find({ recordId: { $in: ids }, ...(v.type ? { type: v.type } : {}) }, { sort: { _id: -1 } }).toArray();
    const r = isOk(tasks[0], v.is as Json);
    return { ok: r.ok, text: `${v.type ?? "any"} task from ${v.from}: ${r.seen}${tasks.length > 1 ? ` [${tasks.length} tasks]` : ""}` };
  }
  if (op === "inbox") {
    const re = String(v.match).toLowerCase();
    const items = (await c.inbox.find({ userId: v.user }).toArray()).filter((i) => String(i.message).toLowerCase().includes(re));
    return { ok: items.length >= Number(v.min ?? 1), text: `inbox of ${v.user} with "${v.match}": ${items.length}, wanted >= ${v.min ?? 1}${items[0] ? ` (${String(items[0].kind)}: "${String(items[0].message).slice(0, 90)}")` : ""}` };
  }
  return { ok: false, text: `unknown operator ${op}` };
}

/** SCENARIO_VERBOSE=1: the open work and the people, to see why a beat failed. */
async function dump() {
  const { tasks, users } = await cols();
  for (const t of await tasks.find({ $or: [{ open: true }, { status: "blocked" }] }).sort({ _id: 1 }).toArray()) {
    const src = await (await cols()).events.findOne({ "result.recordIds.0": t.recordId }, { projection: { dedupeKey: 1 } });
    console.log(`       task ${t.type} ${t.status} ${t.assignee ?? "-"} ${String(src?.dedupeKey).replace(/:[^:]*$/, "")} tried=[${t.tried}] ${t.title.slice(0, 50)}`);
  }
  const { sites, needs } = await cols();
  for (const n of await needs.find({}).toArray()) console.log(`       need ${n.item} x${n.quantity} ${n.status} tier=${n.tier} support=${n.support} ${n.history.at(-1)?.reason ?? ""}`);
  for (const st of await sites.find({ hazard: { $exists: true } }).toArray()) {
    for (const t of await tasks.find({ recordId: st._id }).toArray()) console.log(`       hazard-site task ${t.type} ${t.status} ${t.assignee ?? "-"} open=${t.open}: ${t.history.map((h) => h.reason).join(" / ")}`);
    console.log(`       hazard-site ${st._id} ${st.status} ${st.address} ${JSON.stringify(st.coords)}`);
  }
  for (const u of await users.find({ role: { $ne: "public" } }).toArray()) console.log(`       user ${u._id} ${u.status} seen ${u.lastSeen ? Math.round((T0 + V * 1000 - u.lastSeen.getTime()) / 1000) : "never"} s ago`);
}

const failures: string[] = [];
async function assertBeat(b: Beat, runId: string) {
  const parts: { ok: boolean; text: string }[] = [];
  for (const e of b.expect) parts.push(await evalExpect(e, runId));
  const bad = parts.filter((p) => !p.ok);
  const tag = String(b.beat).padStart(2, "0");
  if (!bad.length) console.log(`PASS beat ${tag} ${b.name}: ${parts.map((p) => p.text).join(" | ")}`);
  else {
    failures.push(`beat ${tag} ${b.name}`);
    console.log(`FAIL beat ${tag} ${b.name} (V=${V}s)`);
    for (const p of parts) console.log(`       ${p.ok ? "ok  " : "FAIL"} ${p.text}`);
    if (!quiet) await dump();
  }
}

// ---------- cleanup ----------
async function cleanup() {
  const c = await cols();
  await Promise.all([
    c.events.deleteMany({}), c.sites.deleteMany({}), c.needs.deleteMany({}), c.roads.deleteMany({}), c.shelters.deleteMany({}),
    c.zones.deleteMany({}), c.incidents.deleteMany({}), c.tasks.deleteMany({}), c.inbox.deleteMany({}), c.messages.deleteMany({}),
    c.meta.deleteMany({ _id: { $in: ["demo"] } }), c.meta.deleteMany({ _id: { $regex: /^(cases|version):/ } }),
  ]);
  await seed(); // the people back to their seeded state
  await getDemo({ fresh: true });
}

async function main() {
  assert(isThrowawayMongo(), "check:scenario wipes every desk: run it against a local Mongo, or set ALLOW_DEMO_WIPE=1");
  assert(KEY, "set AGENT_KEY in .env.local");
  assert.equal(process.env.DEMO_MODE, "1", "set DEMO_MODE=1 in .env.local");
  assert.equal(process.env.DEMO_DEPLOYMENT, undefined, "unset DEMO_DEPLOYMENT");
  assert((await (await cols()).users.findOne({ _id: "coordinator-duty" })), "run npm run db:seed first");

  const beats = JSON.parse(await readFile(join(DIR, "beats.json"), "utf8")) as Beat[];
  const lines = await loadScenario(DIR);
  const header = JSON.parse(await readFile(join(DIR, "header.json"), "utf8")) as { t0: string };
  assert.equal(Date.parse(header.t0), T0, "DEMO_T0 must equal the scenario's t0 (unset DEMO_T0)");

  const run = await startDemo({ now: () => Date.now(), sleep: async () => {}, waitMs: 0, settleMs: 0 });
  ctx.state.runId = run.runId;
  ctx.state.lines = [];
  const started = Date.now();
  const asserted = new Set<number>();
  try {
    await setV(0);
    await presence([]);
    await sweepNow();
    const afterLine = new Map(beats.filter((b) => b.afterLine).map((b) => [b.afterLine!, b]));
    for (const b of beats.filter((x) => x.afterLine === null)) { await assertBeat(b, run.runId); asserted.add(b.beat); }

    for (const [i, line] of lines.entries()) {
      await advanceTo(line.atS);
      await playLine(lines, i, line.atS);
      const id = line.track === "cast" ? `cast:${line.cast!.id ?? `cast:${line.index}`}` : `${line.track}:${String(line.body!.dedupeKey)}`;
      const b = afterLine.get(id);
      if (b) {
        if (b.settleS) await advanceTo(V + b.settleS);
        await presence([...ctx.state.dark]);
        await drain();
        await assertBeat(b, run.runId);
        asserted.add(b.beat);
        if (b.beat >= UNTIL) break;
      }
    }
    for (const b of beats) {
      if (b.beat <= UNTIL && !asserted.has(b.beat)) {
        failures.push(`beat ${b.beat}: afterLine ${b.afterLine} is not a line`);
        console.log(`FAIL beat ${b.beat}: afterLine ${b.afterLine} is not a line`);
      }
    }
  } finally {
    await cleanup();
  }
  console.log(`\n${asserted.size - failures.length}/${asserted.size} beats passed (${lines.length} lines, ${Math.round((Date.now() - started) / 1000)} s real time).`);
  if (failures.length) { console.error(`FAILED: ${failures.join("; ")}`); process.exitCode = 1; }
}

main()
  .catch((err) => { console.error("check:scenario crashed:", err); process.exitCode = 1; })
  .finally(closeDb);
