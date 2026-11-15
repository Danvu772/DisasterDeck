import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { buildSatelliteAlerts, postSatelliteAlerts } from "../workers/satellite-watcher.ts";
import { eventBody } from "../lib/schemas.ts";

const cached = JSON.parse(await readFile(new URL("../public/data/zones.geojson", import.meta.url), "utf8"));

test("cached evidence produces two cold alerts and retains unknown silence", () => {
  const alerts = buildSatelliteAlerts(cached);
  assert.equal(alerts.length, 2);
  assert(alerts.every((alert) => alert.type === "alert" && alert.source === "nasa" && alert.payload.kind === "cold"));
  assert(alerts.every((alert) => alert.payload.evidence.minTempC === -14.38));
  assert(alerts.every((alert) => eventBody.safeParse(alert).success));
  assert.deepEqual(buildSatelliteAlerts(cached), alerts);
  assert.equal(new Set(alerts.map((alert) => alert.dedupeKey)).size, 2);
});

test("silent-zone rule needs measured damage, darkness and few calls together", () => {
  const example = structuredClone(cached);
  const p = example.features[0].properties;
  Object.assign(p, { damage: 0.7, dark: true, silentZone: true });
  assert.equal(buildSatelliteAlerts(example).filter((alert) => alert.payload.kind === "silent_zone").length, 1);
  for (const invalid of [{ damage: null }, { dark: false }, { calls: 2 }]) {
    const changed = structuredClone(example);
    Object.assign(changed.features[0].properties, invalid);
    assert.throws(() => buildSatelliteAlerts(changed), /required evidence/);
    changed.features[0].properties.silentZone = null;
    assert(buildSatelliteAlerts(changed).every((alert) => alert.payload.kind === "cold"));
  }
});

test("invalid desk, duplicate IDs, missing temperatures and future dates fail before posting", () => {
  for (const mutate of [
    (data) => { data.features[0].properties.deskId = "another-desk"; },
    (data) => { data.features.push(data.features[0]); },
    (data) => { data.features[0].properties.minTempC = null; },
    (data) => { data.features[0].properties.temperatureObservedAt = "2027-01-01T00:00:00Z"; },
  ]) {
    const example = structuredClone(cached);
    mutate(example);
    assert.throws(() => buildSatelliteAlerts(example));
  }
});

test("HTTP retry and repeated batches keep stable event IDs", async () => {
  const stored = new Map();
  let requests = 0;
  const server = createServer(async (request, response) => {
    assert.equal(request.url, "/api/events");
    assert.equal(request.headers["x-agent-key"], "test-key");
    let body = "";
    for await (const chunk of request) body += chunk;
    const event = JSON.parse(body);
    assert.equal(event.actor, undefined);
    assert.equal(event.status, undefined);
    assert.equal(event.lane, undefined);
    requests += 1;
    if (!stored.has(event.dedupeKey)) stored.set(event.dedupeKey, `event-${stored.size + 1}`);
    if (requests === 1) {
      response.writeHead(503).end(); // Simulate a stored event whose successful response was lost.
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ id: stored.get(event.dedupeKey) }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const options = { url: `http://127.0.0.1:${server.address().port}/api/events`, agentKey: "test-key" };
    const alerts = buildSatelliteAlerts(cached);
    const first = await postSatelliteAlerts(alerts, options);
    const second = await postSatelliteAlerts(alerts, options);
    assert.deepEqual(first, second);
    assert.equal(stored.size, 2);
    assert.equal(requests, 5);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
