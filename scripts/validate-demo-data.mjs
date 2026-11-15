import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dataDirectory = process.argv[2]
  ? resolve(process.argv[2])
  : fileURLToPath(new URL("../data/", import.meta.url));
const replay = JSON.parse(await readFile(resolve(dataDirectory, "tweets_replay.json"), "utf8"));
const seed = JSON.parse(await readFile(resolve(dataDirectory, "seed.json"), "utf8"));

function assertCoordinates(coords, label) {
  assert(Array.isArray(coords) && coords.length === 2, `${label} needs [lat, lng]`);
  assert(coords.every(Number.isFinite), `${label} coordinates must be finite`);
  assert(coords[0] >= 38.25 && coords[0] <= 38.45, `${label} latitude must be in the Malatya demo extent`);
  assert(coords[1] >= 38.21 && coords[1] <= 38.41, `${label} longitude must be in the Malatya demo extent`);
}

function assertUniqueIds(rows, label, idField = "_id") {
  assert(Array.isArray(rows) && rows.length > 0, `${label} must be a nonempty array`);
  for (const row of rows) {
    assert(typeof row[idField] === "string" && row[idField].trim(), `${label} IDs must be nonempty strings`);
  }
  assert.equal(new Set(rows.map((row) => row[idField])).size, rows.length, `${label} IDs must be unique`);
}

function assertDate(value, label) {
  assert(typeof value === "string" && Number.isFinite(Date.parse(value)), `${label} must be a date string`);
}

assert.equal(seed.deskId, "malatya-2023");
assertUniqueIds(seed.regions, "Regions");
assertUniqueIds(seed.users, "Users");
assertUniqueIds(seed.shelters, "Shelters");
assertUniqueIds(replay, "Replay", "id");
const regionIds = new Set(seed.regions.map((region) => region._id));
const roles = ["volunteer", "field", "supplier", "shelter", "coordinator", "public"];
const trustLevels = ["official", "vetted", "public"];
const vehicles = ["none", "car", "van", "truck"];

for (const region of seed.regions) {
  assert.equal(region.deskId, seed.deskId);
  assert(typeof region.name === "string" && region.name.trim());
  assert(Array.isArray(region.zoneIds) && region.zoneIds.every((id) => typeof id === "string"));
}

for (const user of seed.users) {
  assert.equal(user.deskId, seed.deskId);
  assert(regionIds.has(user.region), `${user._id} has an unknown region`);
  assert(typeof user.name === "string" && user.name.trim());
  assert(roles.includes(user.role), `${user._id} has an unknown role`);
  assert(trustLevels.includes(user.trust), `${user._id} has an unknown trust level`);
  assert.equal(user.status, "available");
  assertCoordinates(user.coords, user._id);
  assert(vehicles.includes(user.profile?.vehicle), `${user._id} needs a vehicle profile`);
  assert(Array.isArray(user.profile.skills) && user.profile.skills.every((skill) => typeof skill === "string"));
  for (const quantity of Object.values(user.profile.stock ?? {})) {
    assert(Number.isInteger(quantity) && quantity >= 0, `${user._id} has invalid stock`);
  }
}

const expectedRoles = {
  "volunteer-callback": "volunteer",
  "volunteer-mechanic": "volunteer",
  "field-alpha": "field",
  "supplier-primary": "supplier",
  "supplier-backup": "supplier",
  "shelter-desk": "shelter",
  "coordinator-duty": "coordinator",
  "coordinator-backup": "coordinator",
  "public-demo": "public",
};
for (const [id, role] of Object.entries(expectedRoles)) {
  assert.equal(seed.users.find((user) => user._id === id)?.role, role, `Missing scenario user ${id}`);
}
for (const id of ["supplier-primary", "supplier-backup"]) {
  assert(seed.users.find((user) => user._id === id).profile.stock?.blankets >= 20, `${id} needs 20 blankets`);
}
const mechanic = seed.users.find((user) => user._id === "volunteer-mechanic");
assert.equal(mechanic.profile.vehicle, "van");
assert(mechanic.profile.skills.includes("mechanic"));

assert.equal(seed.shelters.length, 3);
for (const shelter of seed.shelters) {
  assert.equal(shelter.deskId, seed.deskId);
  assert(regionIds.has(shelter.region), `${shelter._id} has an unknown region`);
  assert(typeof shelter.name === "string" && shelter.name.trim());
  assertCoordinates(shelter.coords, shelter._id);
  assert(Number.isInteger(shelter.bedsUsed) && shelter.bedsUsed >= 0);
  assert(Number.isInteger(shelter.bedsTotal) && shelter.bedsTotal >= shelter.bedsUsed);
  assertDate(shelter.observedAt, `${shelter._id}.observedAt`);
  assertDate(shelter.updated, `${shelter._id}.updated`);
  assert(Array.isArray(shelter.history) && shelter.history.length > 0);
  for (const entry of shelter.history) {
    assertDate(entry.ts, `${shelter._id}.history.ts`);
    assert.equal(entry.source, "system");
    assert(typeof entry.by === "string" && entry.by.trim());
    assert(typeof entry.reason === "string" && entry.reason.trim());
  }
}

assert.equal(replay.length, 5, "The CP1 fixture contains five posts");
for (const [index, post] of replay.entries()) {
  assert.equal(post.id, `demo-malatya-${String(index + 1).padStart(3, "0")}`);
  assert(typeof post.text === "string" && post.text.trim());
  assert.equal(post.ts_offset_seconds, index * 4);
  assert(regionIds.has(post.region), `${post.id} has an unknown region`);
  assertCoordinates(post.coords, post.id);
}
for (const post of replay.slice(0, 4)) {
  assert.deepEqual(post.coords, [38.35, 38.31], "The first four posts share the primary scenario pin");
  assert.equal(post.region, replay[0].region);
  assert(post.text.includes("Ayşe") && post.text.includes("Turuncu Avlu"));
}
assert(replay[4].text.includes("Mor Avlu") && replay[4].text.includes("iki kişi"));
const northMeters = (replay[4].coords[0] - replay[0].coords[0]) * 111000;
const eastMeters = (replay[4].coords[1] - replay[0].coords[1]) * 111000 * Math.cos(replay[0].coords[0] * Math.PI / 180);
assert(Math.hypot(northMeters, eastMeters) > 100, "The control report must stay outside the 100 m merge radius");

console.log(`Validated ${replay.length} replay posts, ${seed.users.length} users and ${seed.shelters.length} shelters for ${seed.deskId}.`);
