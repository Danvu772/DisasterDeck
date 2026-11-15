// Smoke test for lib/db.ts. Run: npm run db:check
// Checks the connection, the indexes, postEvent (dedupe and lanes) and that every read works.
// Everything it writes goes to the throwaway desk "check-db", never to DESK_ID, and the desk's
// events are deleted at the end, also after a failure.
import assert from "node:assert/strict";
import { closeDb, cols, getBoard, getUserContext, postEvent, searchMemory } from "./db";

const DESK = "check-db";

async function cleanup() {
  const c = await cols();
  await c.events.deleteMany({ deskId: DESK });
}

async function main() {
  await cleanup();
  const c = await cols();

  const indexes = (await c.events.indexes()).map((i) => i.name);
  const taskIndexes = (await c.tasks.indexes()).map((i) => i.name);
  const inboxIndexes = (await c.inbox.indexes()).map((i) => i.name);
  for (const name of ["take", "dedupe"]) assert(indexes.includes(name), `events index ${name}`);
  assert(taskIndexes.includes("one_open_task"), "tasks index one_open_task");
  assert(inboxIndexes.includes("inbox_poll"), "inbox index inbox_poll");
  console.log("ok  indexes:", { events: indexes, tasks: taskIndexes, inbox: inboxIndexes });

  // Dedupe: the same key twice gives one event and the same id, even when racing.
  const tweet = {
    deskId: DESK, type: "report" as const, source: "x" as const, actor: "db-check", dedupeKey: "check:1",
    payload: { kind: "trapped", text: "test", textEn: "test" },
  };
  const [a, b] = await Promise.all([postEvent(tweet), postEvent(tweet)]);
  const again = await postEvent(tweet);
  assert.equal(a, b, "racing duplicates return the same id");
  assert.equal(a, again, "a later duplicate returns the same id");
  assert.equal(await c.events.countDocuments({ deskId: DESK, dedupeKey: "check:1" }), 1, "one event stored");
  console.log("ok  dedupe: one event,", a);

  // Lanes: people and the sweeper first, outside sources second.
  const personId = await postEvent({
    deskId: DESK, type: "answer", source: "person", actor: "db-check", dedupeKey: "check:2",
    payload: { taskId: "none", result: "accepted" },
  });
  const person = await c.events.findOne({ _id: personId });
  const tweetDoc = await c.events.findOne({ _id: a });
  assert.equal(person?.lane, 0, "person event is lane 0");
  assert.equal(tweetDoc?.lane, 1, "x event is lane 1");
  assert.equal(tweetDoc?.status, "pending", "new events are pending");
  assert(tweetDoc?.observedAt instanceof Date, "observedAt defaults to now");
  console.log("ok  lanes: person 0, x 1; status pending");

  // Reads work on an empty or seeded database.
  const board = await getBoard(DESK);
  const ctx = await getUserContext("nobody");
  const hits = await searchMemory({ deskId: DESK, collection: "shelters", text: "a" });
  assert(board.health.pending >= 2, "health counts the pending events");
  assert.equal(ctx.user, null, "unknown user gives null");
  console.log("ok  reads:", {
    board: Object.fromEntries(
      Object.entries(board).map(([k, v]) => [k, Array.isArray(v) ? v.length : v]),
    ),
    searchHits: hits.length,
  });

  console.log("\nAll checks passed.");
}

main()
  .catch((err) => {
    console.error("\nFAILED:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    await closeDb();
  });
