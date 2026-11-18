import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dataDirectory = process.argv[2]
  ? resolve(process.argv[2])
  : fileURLToPath(new URL("../data/", import.meta.url));
const seed = JSON.parse(await readFile(resolve(dataDirectory, "seed.json"), "utf8"));

function assertCoordinates(coords, label) {
  assert(Array.isArray(coords) && coords.length === 2, `${label} needs [lat, lng]`);
  assert(coords.every(Number.isFinite), `${label} coordinates must be finite`);
  assert(coords[0] >= 36.10 && coords[0] <= 36.35, `${label} latitude must be in the Antakya demo extent`);
  assert(coords[1] >= 36.05 && coords[1] <= 36.25, `${label} longitude must be in the Antakya demo extent`);
}

function assertUniqueIds(rows, label, idField = "_id") {
  assert(Array.isArray(rows) && rows.length > 0, `${label} must be a nonempty array`);
  for (const row of rows) {
    assert(typeof row[idField] === "string" && row[idField].trim(), `${label} IDs must be nonempty strings`);
  }
  assert.equal(new Set(rows.map((row) => row[idField])).size, rows.length, `${label} IDs must be unique`);
}

assert.equal(seed.deskId, "antakya-2023");
assertUniqueIds(seed.regions, "Regions");
assertUniqueIds(seed.users, "Users");
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

console.log(`Validated ${seed.users.length} users and ${seed.regions.length} regions for ${seed.deskId}.`);
