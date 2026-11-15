import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import type { AlertPayload } from "../lib/types";

export interface SatelliteZones {
  type: "FeatureCollection";
  metadata: {
    version: string;
    deskId: string;
    scenarioAt: string;
    thresholds: { heavyDamageMinFraction: number; fewCallsMax: number };
  };
  features: {
    id: string;
    properties: {
      _id: string;
      deskId: string;
      damage: number | null;
      dark: boolean | null;
      calls: number;
      silentZone: boolean | null;
      cold: boolean | null;
      minTempC: number | null;
      observedAt: string;
      temperatureObservedAt: string;
    };
  }[];
}

export interface SatelliteAlert {
  deskId: string;
  type: "alert";
  source: "nasa";
  observedAt: string;
  dedupeKey: string;
  payload: AlertPayload;
}

function assertObservationDate(value: string, scenarioAt: string) {
  assert(typeof value === "string" && Number.isFinite(Date.parse(value)), "Missing observation date");
  assert(Date.parse(value) <= Date.parse(scenarioAt), "Observation is later than the historical scene");
}

export function buildSatelliteAlerts(zones: SatelliteZones): SatelliteAlert[] {
  assert.equal(zones.type, "FeatureCollection");
  const { metadata } = zones;
  assert(typeof metadata.version === "string" && metadata.version.trim(), "Missing dataset version");
  assert(typeof metadata.deskId === "string" && metadata.deskId.trim(), "Missing desk ID");
  assert(Number.isFinite(Date.parse(metadata.scenarioAt)), "Invalid historical clock");
  const { heavyDamageMinFraction, fewCallsMax } = metadata.thresholds;
  assert(Number.isFinite(heavyDamageMinFraction) && heavyDamageMinFraction >= 0 && heavyDamageMinFraction <= 1);
  assert(Number.isInteger(fewCallsMax) && fewCallsMax >= 0);
  assert(Array.isArray(zones.features), "Missing zone features");
  assert.equal(new Set(zones.features.map((zone) => zone.id)).size, zones.features.length, "Duplicate zone IDs");
  const alerts: SatelliteAlert[] = [];

  for (const zone of zones.features) {
    const p = zone.properties;
    const { damage, dark, calls, minTempC } = p;
    assert(typeof zone.id === "string" && zone.id.trim(), "Missing zone ID");
    assert.equal(zone.id, p._id, "Feature ID differs from zone ID");
    assert.equal(p.deskId, metadata.deskId, "Zone belongs to another desk");
    assert(damage === null || (Number.isFinite(damage) && damage >= 0 && damage <= 1), "Invalid damage fraction");
    assert(dark === null || typeof dark === "boolean", "Invalid darkness flag");
    assert(p.silentZone === null || typeof p.silentZone === "boolean", "Invalid silent-zone flag");
    assert(Number.isInteger(calls) && calls >= 0, "Invalid distinct call count");
    assert(minTempC === null || Number.isFinite(minTempC), "Invalid temperature");
    assert(p.cold === null || typeof p.cold === "boolean", "Invalid cold flag");
    assertObservationDate(p.observedAt, metadata.scenarioAt);
    assertObservationDate(p.temperatureObservedAt, metadata.scenarioAt);

    const silent = damage !== null && dark === true && damage >= heavyDamageMinFraction && calls <= fewCallsMax;
    assert(p.silentZone !== true || silent, "Silent-zone flag lacks the required evidence");
    if (silent) {
      alerts.push({
        deskId: metadata.deskId, type: "alert", source: "nasa", observedAt: p.observedAt,
        dedupeKey: `nasa:${metadata.deskId}:${zone.id}:silent_zone:${p.observedAt}:${metadata.version}`,
        payload: { zoneId: zone.id, kind: "silent_zone", evidence: { damage, dark, calls } },
      });
    }
    const cold = minTempC !== null && minTempC < 0;
    assert(p.cold === null || p.cold === cold, "Cold flag lacks a consistent temperature observation");
    if (cold) {
      alerts.push({
        deskId: metadata.deskId, type: "alert", source: "nasa", observedAt: p.temperatureObservedAt,
        dedupeKey: `nasa:${metadata.deskId}:${zone.id}:cold:${p.temperatureObservedAt}:${metadata.version}`,
        payload: { zoneId: zone.id, kind: "cold", evidence: { minTempC } },
      });
    }
  }
  return alerts;
}

export async function postSatelliteAlerts(alerts: SatelliteAlert[], options: { url: string; agentKey: string }) {
  assert(options.agentKey.trim(), "AGENT_KEY is required to send alerts");
  const ids: string[] = [];
  for (const alert of alerts) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(options.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-agent-key": options.agentKey },
          body: JSON.stringify(alert), signal: AbortSignal.timeout(10000),
        });
      } catch (error) {
        if (attempt === 2) throw error;
        await delay(1000 * (attempt + 1));
        continue;
      }
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        await response.body?.cancel();
        await delay(1000 * (attempt + 1));
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`Event API returned HTTP ${response.status} for ${alert.dedupeKey}`);
      }
      const result = await response.json() as { id?: unknown };
      assert(typeof result.id === "string" && result.id.trim(), "Event API did not return an ID. Retry with the same keys.");
      ids.push(result.id);
      break;
    }
  }
  return ids;
}

async function main() {
  const arguments_ = process.argv.slice(2);
  assert(arguments_.every((value) => value === "--dry-run"), "Supported option is --dry-run");
  const collection = JSON.parse(await readFile(new URL("../public/data/zones.geojson", import.meta.url), "utf8")) as SatelliteZones;
  if (process.env.DESK_ID) assert.equal(collection.metadata.deskId, process.env.DESK_ID);
  const alerts = buildSatelliteAlerts(collection);
  if (arguments_.includes("--dry-run")) {
    console.log(JSON.stringify(alerts, null, 2));
    return;
  }
  const url = new URL("/api/events", process.env.BASE_URL ?? "http://localhost:3000").href;
  const ids = await postSatelliteAlerts(alerts, { url, agentKey: process.env.AGENT_KEY ?? "" });
  console.log(JSON.stringify({ posted: ids.length, eventIds: ids }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: Error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
