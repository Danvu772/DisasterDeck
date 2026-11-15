import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { planScenarioStep, runScenarioStep, StepNotReady, STEPS } from "../workers/scenario-player.ts";
import { eventBody } from "../lib/schemas.ts";

const execFileAsync = promisify(execFile);
const config = JSON.parse(await readFile(new URL("../data/scenarios/malatya.json", import.meta.url), "utf8"));
const seed = JSON.parse(await readFile(new URL("../data/seed.json", import.meta.url), "utf8"));
const player = fileURLToPath(new URL("../workers/scenario-player.ts", import.meta.url));
const deskId = config.deskId;

function makeBoard() {
  return {
    sites: [{ _id: "site-from-keeper", deskId, address: "Malatya merkez, Turuncu Avlu", region: config.site.region,
      coords: config.site.coords, callStatus: "verified", status: "team_on_site" }],
    needs: [{ _id: "need-from-keeper", deskId, item: "blankets", region: config.site.region, quantity: 20,
      siteIds: ["site-from-keeper"], lines: [{ siteId: "site-from-keeper", quantity: 20 }], status: "on_the_way" }],
    tasks: [
      { _id: "dispatch-from-brain", deskId, type: "rescue", recordType: "site", recordId: "site-from-keeper",
        assignee: config.fieldUserId, risk: "high", status: "accepted", open: true },
      { _id: "delivery-from-brain", deskId, type: "deliver", recordType: "need", recordId: "need-from-keeper",
        assignee: config.primarySupplierId, status: "accepted", open: true },
    ],
    shelters: structuredClone(seed.shelters), roads: [], incidents: [],
  };
}

function addBreakdown(board) {
  board.tasks[1].status = "blocked";
  board.tasks[1].open = false;
  board.tasks[1].blockedBy = "incident-from-keeper";
  board.incidents.push({ _id: "incident-from-keeper", deskId, kind: "vehicle_breakdown",
    taskId: "delivery-from-brain", status: "helping", coords: config.breakdown.coords });
  board.tasks.push({ _id: "replacement-from-brain", deskId, type: "deliver", recordType: "need",
    recordId: "need-from-keeper", assignee: config.backupSupplierId, status: "accepted", open: true,
    replaces: "delivery-from-brain" });
}

async function harness(t, board = makeBoard(), handler) {
  const directory = await mkdtemp(join(tmpdir(), "disaster-scenario-"));
  const state = { board, posts: [], stored: new Map(), reads: 0 };
  const server = createServer(async (request, response) => {
    try {
      assert.equal(request.headers["x-agent-key"], "scenario-test-key");
      if (request.method === "GET") {
        const url = new URL(request.url, "http://localhost");
        assert.equal(url.pathname, "/api/board");
        assert.equal(url.searchParams.get("deskId"), deskId);
        state.reads += 1;
        if (handler && await handler({ request, response, state })) return;
        response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(state.board));
        return;
      }
      assert.equal(request.method, "POST");
      assert.equal(request.url, "/api/events");
      let body = "";
      for await (const chunk of request) body += chunk;
      const event = JSON.parse(body);
      state.posts.push(event);
      if (!state.stored.has(event.dedupeKey)) state.stored.set(event.dedupeKey, `event-${state.stored.size + 1}`);
      if (handler && await handler({ request, response, state, event })) return;
      response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ id: state.stored.get(event.dedupeKey) }));
    } catch (error) {
      response.writeHead(500).end(JSON.stringify({ testError: error.message }));
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
    assert(resolve(directory).startsWith(resolve(tmpdir()) + sep));
    assert(basename(directory).startsWith("disaster-scenario-"));
    await rm(directory, { recursive: true });
  });
  const options = { runId: "rehearsal-01", step: "truck-breakdown", baseUrl: `http://127.0.0.1:${server.address().port}`,
    agentKey: "scenario-test-key", stateDirectory: directory, waitSeconds: 0 };
  return { state, options, directory };
}

test("scenario references the delivered seed and historical replay clock", () => {
  assert.equal(config.synthetic, true);
  assert.equal(config.deskId, seed.deskId);
  for (const [id, role] of [[config.fieldUserId, "field"], [config.primarySupplierId, "supplier"], [config.backupSupplierId, "supplier"]]) {
    assert.equal(seed.users.find((user) => user._id === id)?.role, role);
  }
  const shelter = seed.shelters.find((row) => row._id === config.shelter.id);
  assert.equal(shelter.name, config.shelter.name);
  assert.equal(shelter.bedsTotal, config.shelter.bedsTotal);
  assert(config.shelter.bedsUsed > 0.9 * config.shelter.bedsTotal);
  assert.equal(new Date(config.observationBase).toISOString(), new Date(seed.shelters[0].observedAt).toISOString());
  assert(config.stepOffsetsSeconds.blankets > 16);
});

test("blanket fallback uses the real site and waits for an approved dispatch", () => {
  const board = makeBoard();
  board.needs = [];
  const action = planScenarioStep(config, "blankets", "demo", board);
  assert.equal(action.event.payload.siteId, "site-from-keeper");
  assert.equal(action.event.payload.quantity, 20);
  assert.equal(action.event.source, "system");
  assert.equal(action.event.actor, "scenario-player");
  assert.equal(action.event.observedAt, "2023-02-11T06:00:20.000Z");
  board.tasks[0].status = "waiting_approval";
  assert.throws(() => planScenarioStep(config, "blankets", "demo", board), StepNotReady);
  board.tasks[0].status = "accepted";
  board.sites[0].callStatus = "not_called";
  assert.throws(() => planScenarioStep(config, "blankets", "demo", board), StepNotReady);
});

test("a live field request is observed without posting another need", () => {
  const action = planScenarioStep(config, "blankets", "demo", makeBoard());
  assert.equal(action.event, null);
  assert.equal(action.bindings.needId, "need-from-keeper");
});

test("breakdown targets the accepted primary delivery, repair updates the actual incident", () => {
  const board = makeBoard();
  const first = planScenarioStep(config, "truck-breakdown", "demo", board);
  assert.equal(first.event.payload.taskId, "delivery-from-brain");
  assert.equal(first.event.payload.canContinue, false);
  board.tasks[1].status = "assigned";
  assert.throws(() => planScenarioStep(config, "truck-breakdown", "demo", board), StepNotReady);
  addBreakdown(board);
  assert.equal(planScenarioStep(config, "truck-breakdown", "demo", board).event, null);
  const repair = planScenarioStep(config, "truck-repaired", "demo", board);
  assert.equal(repair.event.payload.incidentId, "incident-from-keeper");
  assert.equal(repair.event.payload.taskId, "delivery-from-brain");
  assert.equal(repair.event.payload.resolved, true);
  board.incidents[0].status = "resolved";
  assert.equal(planScenarioStep(config, "truck-repaired", "demo", board).event, null);
});

test("background cues preserve a fuller shelter and an existing road closure", () => {
  const board = makeBoard();
  const capacity = planScenarioStep(config, "shelter-filling", "demo", board);
  assert.equal(capacity.event.payload.bedsUsed, 48);
  board.shelters[0].bedsUsed = 49;
  assert.equal(planScenarioStep(config, "shelter-filling", "demo", board).event, null);
  board.shelters[0].bedsTotal = 60;
  assert.throws(() => planScenarioStep(config, "shelter-filling", "demo", board), /capacity changed/);
  board.roads.push({ _id: "road-real", deskId, road: config.road.name, state: "closed" });
  assert.equal(planScenarioStep(config, "road-closure", "demo", board).event, null);
});

test("foreign desks and ambiguous cases fail before an event is prepared", () => {
  const board = makeBoard();
  board.sites[0].deskId = "another-desk";
  assert.throws(() => planScenarioStep(config, "truck-breakdown", "demo", board), /another desk/);
  board.sites[0].deskId = deskId;
  board.sites.push({ ...board.sites[0], _id: "second-site" });
  assert.throws(() => planScenarioStep(config, "truck-breakdown", "demo", board), /Ambiguous/);
});

test("all five cues use the worker contract and stable, separate keys", () => {
  const board = makeBoard();
  const keys = new Set();
  for (const step of STEPS) {
    const current = structuredClone(board);
    if (step === "blankets") current.needs = [];
    if (step === "truck-repaired") addBreakdown(current);
    const first = planScenarioStep(config, step, "demo", current);
    assert.deepEqual(first, planScenarioStep(config, step, "demo", current));
    assert(first.event);
    assert(["need", "capacity", "closure", "incident"].includes(first.event.type));
    assert.equal(first.event.actor, "scenario-player");
    assert.equal(first.event.source, "system");
    assert.equal(first.event.status, undefined);
    assert.equal(first.event.lane, undefined);
    assert.equal(eventBody.safeParse(first.event).success, true, "Cue must match the real event API schema");
    keys.add(first.event.dedupeKey);
  }
  assert.equal(keys.size, 5);
});

test("real HTTP retry retains one key and a completed step survives process restart", async (t) => {
  const h = await harness(t, makeBoard(), async ({ request, response, state }) => {
    if (request.method === "POST" && state.posts.length === 1) {
      response.writeHead(503).end();
      return true;
    }
    return false;
  });
  const first = await runScenarioStep(config, h.options);
  assert.equal(first.status, "posted");
  assert.equal(h.state.posts.length, 2);
  assert.deepEqual(h.state.posts[0], h.state.posts[1]);
  assert(Math.abs(Date.now() - Date.parse(h.state.posts[0].observedAt)) < 60000, "New synthetic observations use the exercise clock");
  assert.equal(h.state.stored.size, 1);
  const again = await runScenarioStep(config, h.options);
  assert.equal(again.eventId, first.eventId);
  assert.equal(again.replayed, true);
  assert.equal(h.state.posts.length, 2);
  const serialized = await readFile(join(h.directory, config.id, h.options.runId, "truck-breakdown.json"), "utf8");
  assert(!serialized.includes("scenario-test-key"));
  assert(!serialized.includes("x-agent-key"));
});

test("a lost acknowledgement resumes against the original task after replacement", async (t) => {
  let loseAcknowledgement = true;
  const h = await harness(t, makeBoard(), async ({ request, response }) => {
    if (request.method === "POST" && loseAcknowledgement) {
      response.writeHead(200, { "Content-Type": "application/json" }).end("{}");
      return true;
    }
    return false;
  });
  await assert.rejects(runScenarioStep(config, h.options), /did not return an ID/);
  loseAcknowledgement = false;
  addBreakdown(h.state.board);
  h.state.board.tasks.push({ ...h.state.board.tasks[1], _id: "a-later-primary-task", status: "accepted", open: true });
  const resumed = await runScenarioStep(config, h.options);
  assert.equal(resumed.status, "observed");
  assert.equal(resumed.bindings.taskId, "delivery-from-brain");
  assert.equal(resumed.bindings.incidentId, "incident-from-keeper");
  assert.equal(h.state.posts.length, 1);
  const repair = await runScenarioStep(config, { ...h.options, step: "truck-repaired" });
  assert.equal(repair.bindings.taskId, "delivery-from-brain");
  assert.equal(h.state.posts[1].payload.incidentId, "incident-from-keeper");
});

test("concurrent invocations agree on the first atomically prepared binding", async (t) => {
  const waiting = [];
  const h = await harness(t, makeBoard(), async ({ request, response, state }) => {
    if (request.method !== "GET") return false;
    if (state.reads <= 2) {
      const snapshot = structuredClone(state.board);
      const delivery = snapshot.tasks.find((task) => task.type === "deliver" && task.assignee === config.primarySupplierId);
      snapshot.tasks = snapshot.tasks.filter((task) => !(task.type === "deliver" && task.assignee === config.primarySupplierId));
      snapshot.tasks.push({ ...delivery, _id: `candidate-${state.reads}` });
      waiting.push({ response, snapshot });
      if (waiting.length === 2) {
        for (const item of waiting) item.response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(item.snapshot));
      }
      return true;
    }
    return false;
  });
  h.state.board.tasks[1]._id = "candidate-1";
  h.state.board.tasks.push({ ...h.state.board.tasks[1], _id: "candidate-2" });
  const runs = [runScenarioStep(config, h.options), runScenarioStep(config, h.options)];
  const results = await Promise.all(runs);
  assert.equal(h.state.stored.size, 1);
  assert.equal(results[0].bindings.taskId, results[1].bindings.taskId);
  assert(h.state.posts.every((event) => event.payload.taskId === results[0].bindings.taskId));
  const names = await readdir(join(h.directory, config.id, h.options.runId));
  assert(names.every((name) => !name.endsWith(".tmp")));
});

test("the normal CLI dry run reads live state and writes neither events nor a journal", async (t) => {
  const board = makeBoard();
  board.needs = [];
  const h = await harness(t, board);
  const { stdout } = await execFileAsync(process.execPath, [player, "--run", "cli-rehearsal", "--step", "blankets", "--dry-run", "--wait-seconds", "0"], {
    env: { ...process.env, BASE_URL: h.options.baseUrl, AGENT_KEY: "scenario-test-key", SCENARIO_STATE_DIR: h.directory },
  });
  const result = JSON.parse(stdout);
  assert.equal(result.status, "dry-run");
  assert.equal(result.event.payload.siteId, "site-from-keeper");
  assert.equal(h.state.posts.length, 0);
  assert.deepEqual(await readdir(h.directory), []);
});

test("the normal CLI send creates one event and a later invocation returns its receipt", async (t) => {
  const board = makeBoard();
  board.needs = [];
  const h = await harness(t, board);
  const args = [player, "--run", "cli-send", "--step", "blankets", "--wait-seconds", "0"];
  const options = { env: { ...process.env, BASE_URL: h.options.baseUrl, AGENT_KEY: "scenario-test-key", SCENARIO_STATE_DIR: h.directory } };
  const first = JSON.parse((await execFileAsync(process.execPath, args, options)).stdout);
  const second = JSON.parse((await execFileAsync(process.execPath, args, options)).stdout);
  assert.equal(first.status, "posted");
  assert.equal(second.replayed, true);
  assert.equal(second.eventId, first.eventId);
  assert.equal(h.state.posts.length, 1);
});

test("an unattended delayed cue reaches the API after its configured delay", async (t) => {
  let firstRead = 0;
  const h = await harness(t, makeBoard(), async ({ request }) => {
    if (request.method === "GET") firstRead ||= Date.now();
    return false;
  });
  const started = Date.now();
  const result = await runScenarioStep(config, { ...h.options, step: "shelter-filling", delaySeconds: 0.08 });
  assert.equal(result.status, "posted");
  assert(firstRead - started >= 75);
});

test("a condition wait resumes only after the supplier accepts", async (t) => {
  const board = makeBoard();
  board.tasks[1].status = "assigned";
  const h = await harness(t, board);
  const timer = setTimeout(() => { board.tasks[1].status = "accepted"; }, 40);
  t.after(() => clearTimeout(timer));
  const result = await runScenarioStep(config, { ...h.options, waitSeconds: 2 });
  assert.equal(result.status, "posted");
  assert(h.state.reads >= 2);
});

test("a journal is bound to its server and configuration", async (t) => {
  const h = await harness(t);
  await runScenarioStep(config, h.options);
  await assert.rejects(runScenarioStep({ ...config, observationBase: "2023-02-12T06:00:00Z" }, h.options), /different server or configuration/);
  await assert.rejects(runScenarioStep(config, { ...h.options, baseUrl: "http://127.0.0.1:1" }), /different server or configuration/);
  assert.equal(h.state.posts.length, 1);
});

test("missing credentials, invalid run names and unavailable API routes fail clearly", async (t) => {
  const h = await harness(t, makeBoard(), async ({ response }) => {
    response.writeHead(404).end();
    return true;
  });
  await assert.rejects(runScenarioStep(config, { ...h.options, agentKey: "" }), /AGENT_KEY/);
  await assert.rejects(runScenarioStep(config, { ...h.options, runId: "../other" }), /Invalid run/);
  await assert.rejects(runScenarioStep(config, h.options), /HTTP 404/);
  assert.equal(h.state.reads, 1);
  assert.equal(h.state.posts.length, 0);
});

test("invalid quantities, capacities and clock offsets fail before any API call", async (t) => {
  const h = await harness(t);
  for (const mutate of [
    (example) => { example.blankets.quantity = -1; },
    (example) => { example.shelter.bedsUsed = 51; },
    (example) => { example.stepOffsetsSeconds.blankets = -1; },
  ]) {
    const example = structuredClone(config);
    mutate(example);
    await assert.rejects(runScenarioStep(example, h.options));
  }
  assert.equal(h.state.reads, 0);
  assert.equal(h.state.posts.length, 0);
});
