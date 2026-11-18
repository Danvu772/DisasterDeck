// D-0001: motion and liquid-gooey stay out of the production build.
// Run after a production build (DEMO_MODE unset or 0): `npx next build && npm run check:bundle`.
// It reads every JS file the build emitted (.next/static for the browser, .next/server for the
// server) and fails if motion's runtime is in one.
// A DEMO_MODE=1 build keeps motion on purpose: there this check reports it and fails, which is how
// to see the check can fail at all (`npm run check:bundle -- --expect-motion` passes on that build).
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const ROOTS = [path.join(process.cwd(), ".next", "static"), path.join(process.cwd(), ".next", "server")];
// Strings only motion's runtime (motion-dom / framer-motion) carries, minified or not.
const MARKERS = ["data-framer-appear-id", "framerAppearId"];
const expectMotion = process.argv.includes("--expect-motion");

if (!ROOTS.every((r) => existsSync(r))) {
  console.error("No .next/static: run `npx next build` first.");
  process.exit(2);
}

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (p.endsWith(".js")) yield p;
  }
}

const hits = [];
let count = 0;
for (const f of ROOTS.flatMap((r) => [...files(r)])) {
  count++;
  const text = readFileSync(f, "utf8");
  const found = MARKERS.filter((m) => text.includes(m));
  if (found.length) hits.push(`${path.relative(process.cwd(), f)} (${found.join(", ")})`);
}

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const gooey = Boolean(pkg.dependencies?.["liquid-gooey"] || pkg.devDependencies?.["liquid-gooey"]);

console.log(`${count} JS files of the build checked.`);
if (gooey) console.log("liquid-gooey is still a dependency in package.json.");
if (expectMotion) {
  if (hits.length) { console.log(`OK (--expect-motion): motion is in ${hits.length} chunk(s), as a demo build should be.`); process.exit(0); }
  console.error("FAIL (--expect-motion): no motion in this build.");
  process.exit(1);
}
if (hits.length || gooey) {
  if (hits.length) console.error(`FAIL: motion is in the build:\n  ${hits.join("\n  ")}`);
  process.exit(1);
}
console.log("OK: no motion and no liquid-gooey in the build.");
