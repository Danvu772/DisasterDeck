import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const json = async name => JSON.parse(await readFile(resolve(root, name), "utf8"));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const [pilot, imagery, atlas, seed, config] = await Promise.all([
  "data/pilot.json", "public/data/antakya/imagery.json", "public/data/nasa-atlas/atlas.json",
  "data/seed.json", "data/nasa/analysis-config.json",
].map(json));
for (const desk of [seed.deskId, config.deskId]) assert.equal(desk, pilot.id);
assert.deepEqual(atlas.bbox, pilot.bbox);
assert.equal((await json("data/nasa/manifest.json")).configurationSha256, sha(await readFile(resolve(root, "data/nasa/analysis-config.json"))));
let bytes = 0, count = 0;
for (const label of ["before", "after"]) {
  const scene = imagery[label];
  assert.equal(scene.date, pilot[`${label}Date`]);
  assert(scene.sourceGsdMeters.every(gsd => gsd > 0 && gsd < 1));
  assert(scene.exportGsdApproxMeters > 0 && scene.exportGsdApproxMeters < 1.1);
  assert(scene.tiles.length > 0);
  assert(atlas.frames.some(frame => frame.tileURL === scene.tileURL));
  for (const tile of scene.tiles) {
    const path = resolve(root, tile.file);
    assert(path.startsWith(resolve(root, "public/data/antakya") + sep));
    const body = await readFile(path);
    assert.equal(sha(body), tile.sha256, tile.file);
    assert.equal(body.length, tile.bytes);
    assert.equal(body.toString("ascii", 0, 4), "RIFF");
    assert.equal(body.toString("ascii", 8, 12), "WEBP");
    bytes += body.length; count++;
  }
}
for (const name of ["data/imagery/antakya/manifest.json", "data/nasa/manifest.json", "data/nasa/atlas/manifest.json"]) {
  for (const source of (await json(name)).sources) assert.equal(sha(await readFile(resolve(root, source.file))), source.sha256, source.file);
}
for (const date of ["2023-01-03", "2023-02-08"]) {
  const source = await json(`data/nasa/subsets/${date}.json`);
  assert.equal(sha(await readFile(resolve(root, source.file))), source.sha256);
  assert.deepEqual(source.bbox, pilot.bbox);
}
const buildings = await json("public/data/antakya/buildings.geojson");
assert.equal(buildings.features.length, imagery.buildings.count);
assert.equal(buildings.metadata.license, "ODbL-1.0");
assert.equal(new Set(buildings.features.map(f => f.properties.referenceId)).size, buildings.features.length);
for (const feature of buildings.features) {
  assert.equal(feature.properties.modelPrediction, false);
  assert.equal(feature.geometry.type, "Polygon");
  assert(feature.properties.referenceId);
}
const originals = await json("public/data/nasa-atlas/originals.json");
const pairs = await json("public/data/nasa-atlas/radiance-pairs.geojson");
assert.equal(pairs.features.length, originals.pairedRadiance.eligiblePixels);
assert.equal(pairs.features.filter(f => f.properties.lightLoss).length, originals.pairedRadiance.lightLossPixels);
for (const feature of pairs.features) {
  const p = feature.properties;
  assert(p.before >= 10 && p.after >= 0);
  assert(Math.abs((p.after/p.before-1)*100 - p.changePct) < .02);
  assert.equal(p.notBuildingDamage, true);
}
for (const frame of atlas.frames.filter(f => !f.tileURL)) {
  await readFile(resolve(root, "public", frame.image.slice(1)));
  await readFile(resolve(root, "public", frame.limitsImage.slice(1)));
}
console.log(`Antakya portable data verified: ${count} local tiles (${(bytes/1024/1024).toFixed(1)} MiB), ${buildings.features.length} reference buildings, ${pairs.features.length} QA-valid light pairs.`);
