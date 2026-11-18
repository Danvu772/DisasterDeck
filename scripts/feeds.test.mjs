// WS-2: the news agent turns NWS, FEMA and USGS feeds into schema-checked events with a dedupeKey.
// Offline: reads the saved fixtures under agents/fixtures/feeds/ and posts through the fixture desk,
// so no network or database is needed.   npm run check:feeds
import assert from "node:assert/strict";
import test from "node:test";
import { fixtureDesk } from "../agents/desk/fixture-desk.ts";
import { FEED_KINDS, collect } from "../agents/research/news-search.ts";
import { eventBody } from "../lib/schemas.ts";

const DESK = "antakya-2023";

async function allEvents() {
  const out = [];
  for (const kind of FEED_KINDS) out.push(...await collect(kind, { deskId: DESK, replay: true }));
  return out;
}

test("each saved fixture parses into schema-checked news events with a feed dedupeKey", async () => {
  const events = await allEvents();
  assert.equal(events.length, 8, `3 NWS + 3 FEMA + 2 USGS = ${events.length}`);
  for (const e of events) {
    assert.equal(e.source, "news");
    assert.ok(e.actor && /^nws|fema|usgs$/.test(e.actor.replace("-feed", "")));
    assert.match(e.dedupeKey, /^(nws|fema|usgs):antakya-2023:/);
    assert(eventBody.safeParse({ deskId: DESK, ...e }).success, `event does not match its schema: ${e.dedupeKey}`);
  }
  // The FEMA boiler-water entry becomes a need, the rest advisories (reports).
  assert.equal(events.filter((e) => e.type === "need").length, 1);
  assert.equal(events.filter((e) => e.type === "report").length, 7);
});

test("feed mapping is deterministic: the same fixture gives the same events twice", async () => {
  const a = await allEvents();
  const b = await allEvents();
  assert.deepEqual(a.map((e) => e.dedupeKey), b.map((e) => e.dedupeKey));
  assert.deepEqual(JSON.stringify(a), JSON.stringify(b));
});

test("posting a feed event twice through the desk yields one event (dedupeKey)", async () => {
  const events = await allEvents();
  for (const e of events) {
    const event = { deskId: DESK, ...e };
    const first = await fixtureDesk.postEvent(event);
    const again = await fixtureDesk.postEvent(event);
    assert.equal(first, again, `a second post of ${e.dedupeKey} must return the first event's id`);
  }
});

test("USGS entries carry an epicentre as [lat, lng]", async () => {
  const quakes = await collect("usgs", { deskId: DESK, replay: true });
  assert.equal(quakes.length, 2);
  for (const q of quakes) {
    const coords = q.payload.coords;
    assert(Array.isArray(coords) && coords.length === 2, `epicentre present for ${q.dedupeKey}`);
    assert.ok(coords[0] >= 35 && coords[0] <= 42 && coords[1] >= 25 && coords[1] <= 45, `${q.dedupeKey}: a latitude/longitude`);
  }
});
