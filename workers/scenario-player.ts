import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Board, CapacityPayload, ClosurePayload, IncidentPayload, LatLng, Need, NeedPayload, NewEvent, User } from "../lib/types";
import { postWorkerEvents, requestJson } from "../scripts/event-api.mjs";

export const STEPS = ["blankets", "shelter-filling", "road-closure", "truck-breakdown", "truck-repaired"] as const;
export type Step = typeof STEPS[number];
type Snapshot = Pick<Board, "sites" | "needs" | "roads" | "shelters" | "incidents" | "tasks">;
type Payload = NeedPayload | CapacityPayload | ClosurePayload | IncidentPayload;
type ScenarioEvent = Omit<NewEvent<Payload>, "deskId" | "observedAt"> & { deskId: string; observedAt: string; dedupeKey: string };
type Bindings = { siteId?: string; needId?: string; taskId?: string; incidentId?: string; shelterId?: string; roadId?: string };

export interface ScenarioConfig {
  id: string;
  synthetic: boolean;
  deskId: string;
  observationBase: string;
  stepOffsetsSeconds: Record<Step, number>;
  site: { address: string; region: string; coords: LatLng; matchRadiusMeters: number };
  fieldUserId: string;
  primarySupplierId: string;
  backupSupplierId: string;
  blankets: { item: string; quantity: number; lifeThreatening: boolean };
  shelter: { id: string; name: string; bedsUsed: number; bedsTotal: number };
  road: { name: string; coords: LatLng; reason: string };
  breakdown: { coords: LatLng; text: string; textEn: string };
  repair: { text: string; textEn: string };
}

interface Action { event: ScenarioEvent | null; bindings: Bindings; note: string }
interface Prepared { namespace: string; step: Step; action: Action }
interface Receipt { namespace: string; step: Step; status: "posted" | "observed"; bindings: Bindings; eventId?: string; note: string }

export class StepNotReady extends Error {}

function validateConfig(config: ScenarioConfig) {
  assert(/^[A-Za-z0-9_-]{1,64}$/.test(config.id), "Invalid scenario ID");
  assert.equal(config.synthetic, true, "The scenario must identify its synthetic inputs");
  assert(typeof config.deskId === "string" && config.deskId.trim(), "Missing desk ID");
  assert(Number.isFinite(Date.parse(config.observationBase)), "Invalid observation clock");
  for (const step of STEPS) assert(Number.isFinite(config.stepOffsetsSeconds[step]) && config.stepOffsetsSeconds[step] >= 0, "Invalid observation offset");
  for (const coords of [config.site.coords, config.road.coords, config.breakdown.coords]) {
    assert(Array.isArray(coords) && coords.length === 2 && coords.every(Number.isFinite), "Coordinates require [latitude, longitude]");
    assert(Math.abs(coords[0]) <= 90 && Math.abs(coords[1]) <= 180, "Coordinates are outside WGS84");
  }
  assert(Number.isFinite(config.site.matchRadiusMeters) && config.site.matchRadiusMeters > 0);
  assert(Number.isInteger(config.blankets.quantity) && config.blankets.quantity > 0, "Invalid blanket quantity");
  assert.equal(typeof config.blankets.lifeThreatening, "boolean");
  assert(Number.isInteger(config.shelter.bedsUsed) && config.shelter.bedsUsed >= 0
    && Number.isInteger(config.shelter.bedsTotal) && config.shelter.bedsTotal >= config.shelter.bedsUsed, "Invalid shelter capacity");
  assert.notEqual(config.primarySupplierId, config.backupSupplierId, "Replacement supplier must have its own identity");
  for (const text of [config.site.address, config.site.region, config.fieldUserId, config.primarySupplierId, config.backupSupplierId,
    config.blankets.item, config.shelter.id, config.shelter.name, config.road.name, config.road.reason,
    config.breakdown.text, config.breakdown.textEn, config.repair.text, config.repair.textEn]) {
    assert(typeof text === "string" && text.trim(), "Missing scenario identity or observation text");
  }
}

function requireState(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new StepNotReady(reason);
}

function only<T>(items: T[], label: string): T {
  requireState(items.length > 0, `Waiting for ${label}`);
  assert.equal(items.length, 1, `Ambiguous ${label}. Select a clean, single-case rehearsal.`);
  return items[0];
}

function distanceMeters(a: LatLng, b: LatLng) {
  const radians = Math.PI / 180;
  const latitude = Math.sin((b[0] - a[0]) * radians / 2) ** 2;
  const longitude = Math.sin((b[1] - a[1]) * radians / 2) ** 2;
  const h = latitude + Math.cos(a[0] * radians) * Math.cos(b[0] * radians) * longitude;
  return 12742000 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

export function validateSnapshot(board: Snapshot, deskId: string) {
  for (const name of ["sites", "needs", "roads", "shelters", "incidents", "tasks"] as const) {
    assert(Array.isArray(board[name]), `Board is missing ${name}`);
    for (const row of board[name]) {
      assert(typeof row._id === "string" && row._id.trim(), `Invalid ${name} record ID`);
      assert.equal(row.deskId, deskId, `Board contains another desk's ${name}`);
    }
    assert.equal(new Set(board[name].map((row) => row._id)).size, board[name].length, `Duplicate ${name} IDs`);
  }
}

function quantityAtSite(need: Need, siteId: string) {
  const quantities = (need.lines ?? []).filter((line) => line.siteId === siteId).map((line) => line.quantity);
  if (need.siteIds?.length === 1 && need.siteIds[0] === siteId) quantities.push(need.quantity);
  return Math.max(0, ...quantities);
}

export function planScenarioStep(config: ScenarioConfig, step: Step, runId: string, board: Snapshot, bound: Bindings = {}, observationTime?: string): Action {
  validateSnapshot(board, config.deskId);
  assert(STEPS.includes(step), "Unknown scenario step");
  assert(/^[A-Za-z0-9_-]{1,64}$/.test(runId), "Run ID must contain 1–64 letters, numbers, underscores or hyphens");
  const observedAt = observationTime ?? new Date(Date.parse(config.observationBase) + config.stepOffsetsSeconds[step] * 1000).toISOString();
  assert(Number.isFinite(Date.parse(observedAt)), "Invalid observation time");
  const event = (type: ScenarioEvent["type"], payload: Payload): ScenarioEvent => ({
    deskId: config.deskId, type, source: "system", actor: "scenario-player", observedAt,
    dedupeKey: `scenario:${config.deskId}:${config.id}:${runId}:${step}`, payload,
  });

  if (step === "shelter-filling") {
    const shelter = only(board.shelters.filter((row) => row._id === (bound.shelterId ?? config.shelter.id)), "the seeded shelter");
    assert.equal(shelter.name, config.shelter.name, "Shelter name changed");
    assert.equal(shelter.bedsTotal, config.shelter.bedsTotal, "Shelter capacity changed. Review the scenario before sending.");
    assert(Number.isInteger(shelter.bedsUsed) && shelter.bedsUsed >= 0 && shelter.bedsUsed <= shelter.bedsTotal);
    const bindings = { shelterId: shelter._id };
    if (shelter.bedsUsed >= config.shelter.bedsUsed) return { event: null, bindings, note: "Shelter already meets the occupancy cue" };
    return { event: event("capacity", { shelter: shelter.name, bedsUsed: config.shelter.bedsUsed, bedsTotal: shelter.bedsTotal }), bindings, note: "Synthetic shelter occupancy cue" };
  }
  if (step === "road-closure") {
    const roads = board.roads.filter((row) => row.road === config.road.name);
    assert(roads.length <= 1, "Ambiguous demo road");
    const bindings = roads[0] ? { roadId: roads[0]._id } : {};
    if (roads[0]?.state === "closed") return { event: null, bindings, note: "Demo road is already closed" };
    return { event: event("closure", { road: config.road.name, state: "closed", reason: config.road.reason, coords: config.road.coords }), bindings, note: "Synthetic road closure cue" };
  }

  const address = config.site.address.toLocaleLowerCase("tr-TR");
  const sites = board.sites.filter((site) => {
    if (bound.siteId) return site._id === bound.siteId;
    return site.region === config.site.region && site.address.toLocaleLowerCase("tr-TR").includes(address)
      && (!site.coords || distanceMeters(site.coords, config.site.coords) <= config.site.matchRadiusMeters);
  });
  const site = only(sites, "the Turuncu Avlu site");
  assert.equal(site.region, config.site.region);
  const needs = board.needs.filter((need) => (!bound.needId || need._id === bound.needId) && need.item === config.blankets.item && need.region === site.region
    && (need.siteIds?.includes(site._id) || need.lines?.some((line) => line.siteId === site._id)));
  assert(needs.length <= 1, "Ambiguous blanket need for this site");

  if (step === "blankets") {
    const bindings = { siteId: site._id, ...(needs[0] && { needId: needs[0]._id }) };
    if (needs[0] && quantityAtSite(needs[0], site._id) >= config.blankets.quantity) {
      return { event: null, bindings, note: "The field team's blanket need is already recorded" };
    }
    requireState(site.callStatus === "verified" && site.status !== "closed" && site.status !== "retracted", "Waiting for a verified, active site");
    requireState(board.tasks.some((task) => task.type === "rescue" && task.recordType === "site" && task.recordId === site._id
      && task.assignee === config.fieldUserId && task.risk === "high" && ["accepted", "done"].includes(task.status)),
    "Waiting for the coordinator-approved field dispatch to be accepted");
    return { event: event("need", { ...config.blankets, siteId: site._id, region: site.region, coords: site.coords ?? config.site.coords }), bindings, note: "Synthetic fallback for an unattended field team's blanket request" };
  }

  const need = only(needs.filter((row) => !bound.needId || row._id === bound.needId), "the site's blanket need");
  const task = only(board.tasks.filter((row) => row.type === "deliver" && row.recordType === "need" && row.recordId === need._id
    && row.assignee === config.primarySupplierId && (!bound.taskId || row._id === bound.taskId)), "the primary supplier's delivery task");
  const bindings: Bindings = { siteId: site._id, needId: need._id, taskId: task._id };
  const incidents = board.incidents.filter((row) => row.kind === "vehicle_breakdown" && row.taskId === task._id);

  if (step === "truck-breakdown") {
    if (incidents.length) {
      const incident = only(incidents, "the original breakdown incident");
      return { event: null, bindings: { ...bindings, incidentId: incident._id }, note: "The delivery's breakdown is already recorded" };
    }
    requireState(task.status === "accepted" && task.open, "Waiting for the primary supplier to accept the delivery");
    return { event: event("incident", { kind: "vehicle_breakdown", ...config.breakdown, taskId: task._id, canContinue: false }), bindings, note: "Synthetic supplier Problem fallback" };
  }

  const incident = only(incidents.filter((row) => !bound.incidentId || row._id === bound.incidentId), "the existing vehicle breakdown incident");
  bindings.incidentId = incident._id;
  if (incident.status === "resolved") return { event: null, bindings, note: "The same incident is already resolved" };
  return { event: event("incident", { kind: "vehicle_breakdown", ...config.repair, incidentId: incident._id, taskId: task._id, canContinue: true, resolved: true }), bindings, note: "Synthetic repair confirmation for the existing incident" };
}

async function readOptional<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

// A complete file becomes visible in one operation. Concurrent invocations retain the first binding.
async function writeOnce<T>(path: string, value: T): Promise<T> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
  try {
    await link(temporary, path);
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const existing = await readOptional<T>(path);
    assert(existing, "Scenario journal disappeared during preparation");
    return existing;
  } finally {
    await unlink(temporary);
  }
}

export interface RunOptions {
  runId: string;
  step: Step;
  baseUrl: string;
  agentKey: string;
  stateDirectory?: string;
  waitSeconds?: number;
  delaySeconds?: number;
  dryRun?: boolean;
  onWait?: (reason: string) => void;
}

export type RunResult = (Receipt & { replayed: boolean }) | (Action & { step: Step; status: "dry-run" });

export async function runScenarioStep(config: ScenarioConfig, options: RunOptions): Promise<RunResult> {
  validateConfig(config);
  assert(/^[A-Za-z0-9_-]{1,64}$/.test(options.runId), "Invalid run ID");
  assert(STEPS.includes(options.step), "Unknown scenario step");
  assert(options.agentKey.trim(), "AGENT_KEY is required");
  const waitSeconds = options.waitSeconds ?? 30;
  const delaySeconds = options.delaySeconds ?? 0;
  assert(Number.isFinite(waitSeconds) && waitSeconds >= 0 && Number.isFinite(delaySeconds) && delaySeconds >= 0, "Timing values must be finite and nonnegative");
  assert(delaySeconds * 1000 <= 2147483647, "Delay exceeds the platform timer limit");
  const base = new URL(options.baseUrl);
  assert(["http:", "https:"].includes(base.protocol) && !base.username && !base.password, "Use an HTTP(S) base URL without embedded credentials");
  const fingerprint = createHash("sha256").update(JSON.stringify(config)).digest("hex");
  const namespace = `${base.origin}|${config.deskId}|${config.id}|${options.runId}|${fingerprint}`;
  const directory = join(options.stateDirectory ?? fileURLToPath(new URL("../data/scenario-state", import.meta.url)), config.id, options.runId);
  const path = join(directory, `${options.step}.json`);
  const resultPath = join(directory, `${options.step}.result.json`);
  const previous = await readOptional<Receipt>(resultPath);
  if (previous) {
    assert.equal(previous.namespace, namespace, "Run belongs to a different server or configuration");
    assert.equal(previous.step, options.step);
    return { ...previous, replayed: true };
  }
  let prepared = await readOptional<Prepared>(path);
  if (prepared) {
    assert.equal(prepared.namespace, namespace, "Run belongs to a different server or configuration");
    assert.equal(prepared.step, options.step);
  }
  let inherited: Bindings = {};
  if (!prepared && options.step === "truck-repaired") {
    const breakdown = await readOptional<Prepared>(join(directory, "truck-breakdown.json"));
    if (breakdown) {
      assert.equal(breakdown.namespace, namespace);
      inherited = breakdown.action.bindings;
    }
  }
  if (delaySeconds) await delay(delaySeconds * 1000);
  const deadline = Date.now() + waitSeconds * 1000;
  let lastReason = "";
  let action: Action;
  while (true) {
    if (prepared?.action.event === null) {
      action = prepared.action;
      break;
    }
    const boardUrl = new URL("/api/board", base);
    boardUrl.searchParams.set("deskId", config.deskId);
    const board = await requestJson({ url: boardUrl.href, agentKey: options.agentKey }) as Snapshot;
    try {
      const observedAt = prepared?.action.event?.observedAt ?? new Date().toISOString();
      action = planScenarioStep(config, options.step, options.runId, board, prepared?.action.bindings ?? inherited, observedAt);
      break;
    } catch (error) {
      if (!(error instanceof StepNotReady) || Date.now() >= deadline) throw error;
      if (error.message !== lastReason) options.onWait?.(error.message);
      lastReason = error.message;
      await delay(Math.min(1000, Math.max(0, deadline - Date.now())));
    }
  }
  if (options.dryRun) return { step: options.step, status: "dry-run", ...action };
  await mkdir(directory, { recursive: true });
  if (!prepared) {
    prepared = await writeOnce(path, { namespace, step: options.step, action });
    // A competing invocation may have selected different IDs. Rebuild against the winning binding.
    if (JSON.stringify(prepared.action) !== JSON.stringify(action)) {
      return runScenarioStep(config, { ...options, delaySeconds: 0 });
    }
  }
  assert.equal(prepared.namespace, namespace, "Concurrent run has a different configuration");
  assert.equal(prepared.step, options.step);
  let receipt: Receipt = { namespace, step: options.step, status: "observed", bindings: action.bindings, note: action.note };
  if (action.event && prepared.action.event) {
    assert.deepEqual(action.event, prepared.action.event, "Prepared event changed. Keep the original run/configuration.");
    const [eventId] = await postWorkerEvents([prepared.action.event], { url: new URL("/api/events", base).href, agentKey: options.agentKey });
    receipt = { ...receipt, status: "posted", eventId };
  }
  const saved = await writeOnce(resultPath, receipt);
  assert.equal(saved.namespace, namespace);
  if (saved.eventId && receipt.eventId) assert.equal(saved.eventId, receipt.eventId, "API returned different IDs for one event key");
  return { ...saved, replayed: false };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--list") {
    console.log(STEPS.join("\n"));
    return;
  }
  const values = new Map<string, string>();
  let dryRun = false;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--dry-run") {
      dryRun = true;
      continue;
    }
    assert(["--run", "--step", "--wait-seconds", "--delay-seconds"].includes(args[index]), `Unknown option ${args[index]}`);
    assert(!values.has(args[index]) && args[index + 1] && !args[index + 1].startsWith("--"), `Missing or duplicate ${args[index]}`);
    values.set(args[index], args[index + 1]);
    index += 1;
  }
  assert(values.has("--run") && values.has("--step"), "Use --list or --run <rehearsal-id> --step <step>");
  const config = JSON.parse(await readFile(new URL("../data/scenarios/malatya.json", import.meta.url), "utf8")) as ScenarioConfig;
  const seed = JSON.parse(await readFile(new URL("../data/seed.json", import.meta.url), "utf8")) as { deskId: string; users: User[] };
  assert.equal(seed.deskId, config.deskId);
  for (const [id, role] of [[config.fieldUserId, "field"], [config.primarySupplierId, "supplier"], [config.backupSupplierId, "supplier"]]) {
    assert.equal(seed.users.find((user) => user._id === id)?.role, role, `Missing seeded ${id}`);
  }
  if (process.env.DESK_ID) assert.equal(process.env.DESK_ID, config.deskId);
  const result = await runScenarioStep(config, {
    runId: values.get("--run")!, step: values.get("--step") as Step, dryRun,
    baseUrl: process.env.BASE_URL ?? "http://localhost:3000", agentKey: process.env.AGENT_KEY ?? "",
    stateDirectory: process.env.SCENARIO_STATE_DIR && resolve(process.env.SCENARIO_STATE_DIR),
    waitSeconds: Number(values.get("--wait-seconds") ?? 30), delaySeconds: Number(values.get("--delay-seconds") ?? 0),
    onWait: (reason) => console.error(reason),
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: Error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
