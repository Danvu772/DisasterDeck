import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { readReplay, replayKey, replayObservation } from "../agents/research/replay-input.ts";
import { maskPhones } from "../agents/shared/privacy.ts";
import { eventBody } from "../lib/schemas.ts";

const run = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const realFile = join(root, "data/replays/antakya-real-tweets.json");
const real = readReplay(realFile);
const worker = join(root, "workers/x-agent.ts");
const env = { ...process.env, DESK_BACKEND: "fixture", DESK_ID: "antakya-2023", OPENROUTER_API_KEY: "" };

async function fixture(t, rows) {
  const cache = resolve(root, ".next/cache");
  await mkdir(cache, { recursive: true });
  const directory = await mkdtemp(join(cache, "real-replay-test-"));
  assert(resolve(directory).startsWith(cache + sep));
  t.after(async () => { assert(resolve(directory).startsWith(cache + sep)); await rm(directory, { recursive: true, force: true }); });
  const file = join(directory, "input.json");
  await writeFile(file, JSON.stringify(rows));
  return file;
}

test("committed real archive has source hashes, string IDs, real dates and no invented coordinates", async () => {
  const manifest = JSON.parse(await readFile(join(root, "data/replays/real-tweets-manifest.json"), "utf8"));
  assert.equal(createHash("sha256").update(await readFile(realFile)).digest("hex"), manifest.sha256);
  assert.equal(real.length, 43);
  assert.equal(new Set(real.map(t => t.id)).size, real.length);
  for (const [index, tweet] of real.entries()) {
    assert.equal(tweet.provenance.synthetic, false);
    assert.equal(tweet.provenance.dataset, "gpreda/turkey-earthquake-tweets");
    assert.equal(tweet.provenance.originalTextSha256.length, 64);
    assert.equal(tweet.sourceURL, `https://x.com/i/status/${tweet.id}`);
    assert(tweet.observedAt >= "2023-02-06" && tweet.observedAt < "2023-02-11");
    assert.equal(tweet.ts_offset_seconds, index * 4);
    assert.equal(tweet.coords, undefined);
    assert.equal(maskPhones(tweet.text).phones.length, 0);
  }
});

test("archive publication time survives replay and keys stay stable per desk", () => {
  const now = new Date("2026-11-15T08:00:00Z");
  assert.equal(replayObservation(real[0], now), real[0].observedAt);
  assert.equal(replayKey(real[0], "antakya-2023"), replayKey(real[0], "antakya-2023"));
  assert.notEqual(replayKey(real[0], "other-desk"), replayKey(real[0], "antakya-2023"));
  const synthetic = { id: "demo-antakya-001", text: "test", ts_offset_seconds: 0 };
  assert.equal(replayObservation(synthetic, now), now.toISOString());
  assert.equal(replayKey(synthetic, "antakya-2023"), "x:demo-antakya-001");
});

test("tampered dates, lost numeric ID precision and duplicate IDs fail before processing", async t => {
  for (const rows of [
    [{ ...real[0], observedAt: undefined }],
    [{ ...real[0], observedAt: "2026-11-15T00:00:00Z" }],
    [{ ...real[0], id: Number(real[0].id) }],
    [real[0], real[0]],
  ]) {
    const file = await fixture(t, rows);
    assert.throws(() => readReplay(file));
  }
});

test("real command refuses an unconfigured fixture backend", async () => {
  await assert.rejects(run(process.execPath, ["--import", "tsx", worker, "--file", realFile, "--require-live", "--mock"], { cwd: root, env }), error => {
    assert.match(error.stderr, /No real desk configured/);
    assert.equal(error.stdout, "");
    return true;
  });
});

test("bare worker now defaults to real posts, with synthetic rehearsal still explicit", async () => {
  const { stderr } = await run(process.execPath, ["--import", "tsx", worker, "--dry-run", "--mock", "--limit", "1", "--speed", "100000"], { cwd: root, env });
  assert.match(stderr, /antakya-real-tweets\.json/);
  assert.match(stderr, /1 historical real posts/);
});

test("CLI dry run preserves supplied history through the actual event emitter", async t => {
  // Deliberately synthetic transport fixture; it is never labeled a real source post.
  const synthetic = JSON.parse(await readFile(join(root, "data/tweets_replay.json"), "utf8"))[0];
  const file = await fixture(t, [{ ...synthetic, observedAt: "2023-02-07T12:00:00Z" }]);
  const { stdout } = await run(process.execPath, ["--import", "tsx", worker, "--file", file, "--require-live", "--dry-run", "--mock", "--speed", "100000"], { cwd: root, env });
  const events = stdout.trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
  assert.equal(events.length, 1);
  assert.equal(events[0].observedAt, "2023-02-07T12:00:00Z");
  assert.equal(events[0].source, "x");
  assert(eventBody.safeParse(events[0]).success);
});

test("all real rows traverse the worker preview without model calls or database writes", async () => {
  const { stdout, stderr } = await run(process.execPath, ["--import", "tsx", worker, "--file", realFile, "--require-live", "--dry-run", "--mock", "--speed", "100000"], { cwd: root, env });
  assert.match(stderr, /43 historical real posts/);
  assert.match(stderr, /0 failed/);
  assert.match(stderr, /cost \$0\.0000/);
  // The existing mock extractor is Turkish-only; this largely English news sample is skipped.
  assert.match(stderr, /43 skipped/);
  assert.equal(stdout.trim(), "");
});
