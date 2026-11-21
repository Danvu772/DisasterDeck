import assert from "node:assert/strict";
import test from "node:test";
import { pilot, pilotCenter, configuredDeskId } from "../src/lib/pilot.ts";
import { makeOpsPosts } from "../src/fixtures/opsPosts.ts";
import { fromEvents, summarize } from "../src/components/ops/opsModel.ts";
import { fixtureDesk } from "../src/agents/desk/fixture-desk.ts";

test("exercise posts stay inside the Antakya pilot and shelter pins stay stable", () => {
  const [west, south, east, north] = pilot.bbox;
  const shelterPositions = new Map();
  for (const seed of [2023, 2024, 7]) {
    const posts = makeOpsPosts(seed);
    assert(posts.length > 100);
    for (const post of posts) {
      assert(!/Malatya|Battalgazi|Yeşilyurt/i.test(post.text + post.textEn + post.district));
      if (!post.coords) continue;
      const [lat, lon] = post.coords;
      assert(lat >= south && lat <= north && lon >= west && lon <= east, post.id);
      if (post.outcome.kind === "shelter") {
        const key = post.outcome.name;
        if (shelterPositions.has(key)) assert.deepEqual(post.coords, shelterPositions.get(key));
        shelterPositions.set(key, post.coords);
      }
    }
  }
  assert.equal(shelterPositions.size, 3);
});

test("fixture roles share the pilot desk and region", async () => {
  for (const user of await fixtureDesk.listUsers()) {
    assert.equal(user.deskId, pilot.id, user._id);
    assert.equal(user.region, pilot.region, user._id);
  }
  assert.deepEqual(pilotCenter, pilot.center);
});

test("worker desk defaults respect explicit deployment selection", () => {
  const previous = process.env.DESK_ID;
  try {
    delete process.env.DESK_ID;
    assert.equal(configuredDeskId(), pilot.id);
    process.env.DESK_ID = "check-isolated";
    assert.equal(configuredDeskId(), "check-isolated");
  } finally {
    if (previous === undefined) delete process.env.DESK_ID;
    else process.env.DESK_ID = previous;
  }
});

test("live newest-first events produce chronological posts and current hourly counts", () => {
  const event = (id, time) => ({
    _id: id, deskId: pilot.id, source: "x", type: "report", actor: "x-agent",
    ts: new Date(time), status: "applied", payload: { kind: "trapped", text: "Exercise", region: pilot.region },
    result: { recordIds: [id] },
  });
  const posts = fromEvents([
    event("new", "2026-11-15T12:30:00Z"),
    event("old", "2026-11-15T11:10:00Z"),
  ]);
  assert.deepEqual(posts.map(p => p.id), ["old", "new"]);
  const summary = summarize(posts, [], { live: true });
  assert.equal(summary.perHour.length, 2);
  assert.equal(summary.perHour.reduce((sum, hour) => sum + hour.posts, 0), 2);
  assert.equal(summary.perHour.at(-1).posts, 1);
  assert.equal(summary.perHour.at(-2).posts, 1);
  const replay = makeOpsPosts();
  assert.equal(summarize(replay, []).perHour.reduce((sum, h) => sum + h.posts, 0), replay.length);
});
