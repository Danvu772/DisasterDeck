// The player (D-0017 §4): the only input worker. It holds no state worth keeping.
//
//   npm run player
//
// Once a second it reads the `demo` document. While it says "playing" it merges the scenario's
// tracks (data/scenarios/antakya-demo/{x,instagram,facebook,ap,cast}.jsonl) by `atS` and posts every
// line that is due and that this process has not posted yet in this run, through POST /api/events,
// the same door every client uses. Each dedupeKey gets `:<runId>` appended, so a new run is a fresh
// set and a restart of the player re-posts only what the queue already has (dedupe absorbs it).
//
// Source line: { "atS": n, "body": <POST /api/events body> }
// Cast line:   { "atS": n, "as": "assignee" | <userId>, "do": "accept" | "en_route" | "arrived" | "done" |
//                "decline" | "problem" | "approve" | <an event type>, "task": { "fromEvent": "<dedupeKey>" },
//                "payload"?: {...} }
// A cast line posts as `source: "person"` with the agent key naming the seeded user as actor (the
// route lets a worker name itself). It waits until the task built from `fromEvent` exists, and is
// skipped when a signed-in person has already acted on that task.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { closeDb, cols } from "../lib/db";
import { getDemo, scenarioSecond } from "../lib/demo";
import { isDemoDeployment } from "../lib/pilot";
import { requestJson } from "../../scripts/event-api.mjs";

export const TRACKS = ["x", "instagram", "facebook", "ap", "cast"] as const;
export type Track = (typeof TRACKS)[number];
/** A cast line whose task has not appeared this many scenario seconds after its atS is dropped. */
export const CAST_GIVE_UP_S = 600;

type Json = Record<string, unknown>;
export interface CastLine {
  atS: number; as: string; do: string; task?: { fromEvent: string; type?: string }; payload?: Json;
}
export interface Line { track: Track; index: number; atS: number; body?: Json; cast?: CastLine }

export interface PlayerState { runId: string | null; lines: Line[]; done: Set<string> }
export interface PlayerCtx {
  /** The scenario folder. */
  dir: string;
  /** Posts one event body through POST /api/events. */
  post: (body: Json) => Promise<unknown>;
  state: PlayerState;
  log?: (msg: string) => void;
}
export const newPlayerState = (): PlayerState => ({ runId: null, lines: [], done: new Set() });

/** Every track of the scenario folder merged by atS (ties: track order, then file order). Missing files are empty tracks. */
export async function loadScenario(dir: string): Promise<Line[]> {
  const lines: Line[] = [];
  for (const track of TRACKS) {
    let text: string;
    try {
      text = await readFile(join(dir, `${track}.jsonl`), "utf8");
    } catch (err) {
      if ((err as { code?: string }).code === "ENOENT") continue;
      throw err;
    }
    let index = 0;
    for (const [n, raw] of text.split("\n").entries()) {
      if (!raw.trim()) continue;
      let row: Json;
      try { row = JSON.parse(raw) as Json; } catch { throw new Error(`${track}.jsonl line ${n + 1} is not JSON`); }
      if (typeof row.atS !== "number") throw new Error(`${track}.jsonl line ${n + 1} has no numeric atS`);
      if (track === "cast") lines.push({ track, index, atS: row.atS, cast: row as unknown as CastLine });
      else if (row.body && typeof row.body === "object") lines.push({ track, index, atS: row.atS, body: row.body as Json });
      else throw new Error(`${track}.jsonl line ${n + 1} has no body`);
      index++;
    }
  }
  const order = (t: Track) => TRACKS.indexOf(t);
  return lines.sort((a, b) => a.atS - b.atS || order(a.track) - order(b.track) || a.index - b.index);
}

const keyOf = (l: Line) => `${l.track}:${l.index}`;

const ANSWER: Record<string, Json> = {
  accept: { result: "accepted" },
  en_route: { result: "accepted", progress: "en_route" },
  arrived: { result: "accepted", progress: "arrived" },
  done: { result: "done" },
  decline: { result: "declined" },
};
const EVENT_TYPES = ["report", "need", "closure", "capacity", "answer", "approval", "alert", "incident", "claim", "correction", "plan"];

/** What the line posts, once its task is known. Null for a `do` we do not know. */
function castEvent(c: CastLine, taskId: string | undefined): { type: string; payload: Json } | null {
  const extra = c.payload ?? {};
  if (c.do in ANSWER) return taskId ? { type: "answer", payload: { taskId, ...ANSWER[c.do], ...extra } } : null;
  if (c.do === "approve") return taskId ? { type: "approval", payload: { taskId, approved: true, ...extra } } : null;
  if (c.do === "problem") {
    return taskId
      ? { type: "incident", payload: { kind: "other", text: "Sorun var", textEn: "There is a problem", canContinue: false, ...extra, taskId } }
      : null;
  }
  if (EVENT_TYPES.includes(c.do)) return { type: c.do, payload: { ...(taskId ? { taskId } : {}), ...extra } };
  return null;
}

type CastResult = "posted" | "skipped" | "waiting";

/** Resolve a cast line's task and, unless a person got there first, post it. */
async function playCast(line: Line, state: PlayerState, ctx: PlayerCtx): Promise<CastResult> {
  const c = line.cast!;
  const runId = state.runId!;
  const { events, tasks } = await cols();

  let task: { _id?: string; assignee?: string; deskId: string } | null = null;
  if (c.task?.fromEvent) {
    const from = await events.findOne({ dedupeKey: `${c.task.fromEvent}:${runId}` }, { projection: { result: 1 } });
    const ids = from?.result?.recordIds ?? [];
    if (!ids.length) return "waiting";
    task = await tasks.findOne(
      { recordId: { $in: ids }, ...(c.task.type ? { type: c.task.type as never } : {}) },
      { sort: { _id: -1 }, projection: { assignee: 1, deskId: 1 } },
    );
    if (!task) return "waiting";
  }

  const actor = c.as === "assignee" ? task?.assignee : c.as;
  if (!actor) return "waiting"; // the dispatcher has not picked anyone yet

  if (task?._id) {
    // A signed-in person already acted on this task: the presenter has taken over (D-0017 §3).
    const person = await events.countDocuments({
      source: "person", "payload.taskId": task._id,
      $or: [{ dedupeKey: { $exists: false } }, { dedupeKey: { $not: /^cast:/ } }],
    });
    if (person > 0) return "skipped";
  }

  const ev = castEvent(c, task?._id);
  if (!ev) {
    ctx.log?.(`cast line ${line.index} (${c.do}) has nothing to act on, dropped`);
    return "skipped";
  }
  await ctx.post({
    ...ev, source: "person", actor, dedupeKey: `cast:${line.index}:${runId}`, ...(task ? { deskId: task.deskId } : {}),
  });
  return "posted";
}

export interface TickResult { posted: number; skipped: number; waiting: number }

/**
 * One turn of the player at real time `nowMs` (a check injects the clock). Reads the demo document,
 * posts every due line not yet posted in this run. Source lines go in atS order; a failed post
 * stops the turn so order holds, and the line is tried again next turn.
 */
export async function tickOnce(nowMs: number, ctx: PlayerCtx): Promise<TickResult> {
  const out: TickResult = { posted: 0, skipped: 0, waiting: 0 };
  if (!isDemoDeployment()) return out;
  const doc = await getDemo({ fresh: true, nowMs });
  if (doc?.state !== "playing") return out; // no run, or prepping: do nothing
  const state = ctx.state;
  if (state.runId !== doc.runId) {
    state.runId = doc.runId;
    state.done = new Set();
    state.lines = await loadScenario(ctx.dir);
    ctx.log?.(`run ${doc.runId}: ${state.lines.length} lines`);
  }
  const sec = scenarioSecond(doc, nowMs)!;

  for (const line of state.lines) {
    if (line.atS > sec) break;
    const key = keyOf(line);
    if (state.done.has(key)) continue;
    try {
      if (line.track !== "cast") {
        const base = typeof line.body!.dedupeKey === "string" ? line.body!.dedupeKey : `${line.track}:${line.index}`;
        await ctx.post({ ...line.body, dedupeKey: `${base}:${state.runId}` });
        state.done.add(key);
        out.posted++;
        continue;
      }
      const r = await playCast(line, state, ctx);
      if (r === "posted") { state.done.add(key); out.posted++; }
      else if (r === "skipped") { state.done.add(key); out.skipped++; }
      else if (sec - line.atS > CAST_GIVE_UP_S) {
        ctx.log?.(`cast line ${line.index} (${line.cast!.do}): no task after ${CAST_GIVE_UP_S / 60} scenario minutes, skipped`);
        state.done.add(key);
        out.skipped++;
      } else out.waiting++;
    } catch (err) {
      ctx.log?.(`${key} failed, will retry: ${err instanceof Error ? err.message : String(err)}`);
      if (line.track !== "cast") break;
    }
  }
  return out;
}

const log = (m: string) => console.log(`[player ${new Date().toISOString().slice(11, 19)}] ${m}`);

async function main() {
  const base = (process.env.DEMO_API_URL || "http://localhost:3000").replace(/\/$/, "");
  const agentKey = process.env.AGENT_KEY ?? "";
  if (!agentKey) throw new Error("AGENT_KEY is not set");
  const dir = process.env.SCENARIO_DIR || join(import.meta.dirname, "..", "..", "data", "scenarios", "antakya-demo");
  const ctx: PlayerCtx = {
    dir, state: newPlayerState(), log,
    post: (body) => requestJson({ url: `${base}/api/events`, agentKey, method: "POST", body: body as never }),
  };
  let stopping = false;
  process.on("SIGINT", () => { stopping = true; });
  process.on("SIGTERM", () => { stopping = true; });
  log(`starting, scenario ${dir}, api ${base}`);
  while (!stopping) {
    try {
      const r = await tickOnce(Date.now(), ctx);
      if (r.posted || r.skipped) log(`posted ${r.posted}, skipped ${r.skipped}, waiting ${r.waiting}`);
    } catch (err) {
      log(`turn failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    await sleep(1000);
  }
  await closeDb();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (err) => {
    console.error("[player] crashed:", err);
    await closeDb();
    process.exit(1);
  });
}
