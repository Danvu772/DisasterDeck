// The product is Disaster Deck, like https://disasterdeck.us (#40). This fails when the old name
// (Disaster + Desk) comes back in any spelling: with a space, a hyphen, no space, %20, a line break
// between the words, any case. It looks in tracked files, file and folder names, and rendered pages.
//
//   node scripts/check-name.mjs                                repo: tracked files and paths
//   node scripts/check-name.mjs --site http://127.0.0.1:3000   also every page and its JS chunks
//
// One spelling is allowed: the MongoDB database name disaster_desk. Renaming it would point every
// app, worker and laptop at a new, empty database.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const OLD = /disaster(?:[\s_.\-]|%20|&nbsp;|\\u00a0|\\n)*desk/gi;
const ALLOWED = new Set(["disaster_desk"]);
const NEW = /Disaster Deck/;
const hits = [];

function scan(text, where) {
  for (const m of text.matchAll(OLD)) {
    if (ALLOWED.has(m[0])) continue;
    const line = text.slice(0, m.index).split("\n").length;
    const around = text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40).replace(/\s+/g, " ");
    hits.push(`${where}:${line}  …${around}…`);
  }
}

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
let scanned = 0;
for (const f of files) {
  scan(f, `path ${f}`);
  let buf;
  try { buf = readFileSync(f); } catch { continue; }
  if (buf.includes(0)) continue; // binary: images, video, archives
  scan(buf.toString("utf8"), f);
  scanned++;
}
console.log(`repo: ${scanned} text files and ${files.length} paths checked`);

const at = process.argv.indexOf("--site");
if (at > 0) {
  const base = (process.argv[at + 1] ?? "").replace(/\/$/, "");
  if (!base) throw new Error("--site needs a URL");
  const pages = files
    .filter((f) => /^app\/(.*\/)?page\.tsx$/.test(f) && !f.includes("["))
    .map((f) => "/" + f.replace(/^app\/?/, "").replace(/\/?page\.tsx$/, "").replace(/\([^)]*\)\/?/g, "").replace(/\/$/, ""));
  const chunks = new Set();
  let sawNew = false;
  for (const p of [...new Set(pages)].sort()) {
    const res = await fetch(base + p);
    const html = await res.text();
    console.log(`page ${p} -> ${res.status}${res.redirected ? ` (redirected to ${new URL(res.url).pathname})` : ""}`);
    if (res.status >= 500) hits.push(`page ${p}: HTTP ${res.status}`);
    scan(html, `page ${p}`);
    if (NEW.test(html)) sawNew = true;
    for (const m of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+\.(?:js|css))"/g)) chunks.add(m[1]);
  }
  for (const c of chunks) {
    const js = await (await fetch(base + c)).text();
    scan(js, `asset ${c}`);
    if (NEW.test(js)) sawNew = true;
  }
  console.log(`site: ${pages.length} pages and ${chunks.size} JS/CSS assets checked on ${base}`);
  if (!sawNew) hits.push(`site: "Disaster Deck" appears on no page or asset of ${base}`);
}

if (hits.length) {
  console.error(`\nFAIL: the old name is still there (${hits.length}):`);
  for (const h of hits) console.error("  " + h);
  process.exit(1);
}
console.log("OK: the old name is nowhere, and Disaster Deck is what renders");
