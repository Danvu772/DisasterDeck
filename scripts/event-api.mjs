import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

/** @typedef {Omit<import('../src/lib/types').NewEvent, 'deskId' | 'actor' | 'observedAt'> & {deskId: string, actor?: string, observedAt: string}} WorkerEvent */

/**
 * @param {{url: string, agentKey: string, method?: 'GET' | 'POST', body?: WorkerEvent}} options
 * @returns {Promise<unknown>}
 */
export async function requestJson(options) {
  assert(options.agentKey.trim(), "AGENT_KEY is required for the event API");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response;
    try {
      response = await fetch(options.url, {
        method: options.method ?? "GET",
        headers: { "Content-Type": "application/json", "x-agent-key": options.agentKey },
        body: options.body && JSON.stringify(options.body),
        signal: AbortSignal.timeout(10000),
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
      throw new Error(`Event API returned HTTP ${response.status}`);
    }
    return response.json();
  }
  throw new Error("Event API retry limit reached");
}

/**
 * @param {readonly WorkerEvent[]} events
 * @param {{url: string, agentKey: string}} options
 * @returns {Promise<string[]>}
 */
export async function postWorkerEvents(events, options) {
  assert(options.agentKey.trim(), "AGENT_KEY is required to send events");
  const ids = [];
  for (const event of events) {
    const result = await requestJson({ ...options, method: "POST", body: event });
    assert(result && typeof result === "object" && "id" in result && typeof result.id === "string" && result.id.trim(),
      "Event API did not return an ID. Retry with the same keys.");
    ids.push(result.id);
  }
  return ids;
}
