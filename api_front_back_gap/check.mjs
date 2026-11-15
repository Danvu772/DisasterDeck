// The approval check for the Role 1 / Role 3 pair. No dependencies.
//   node api_front_back_gap/check.mjs                     validate every proposal and gap id
//   node api_front_back_gap/check.mjs --as role-3         check this branch against owners.json
//   node api_front_back_gap/check.mjs --as role-1 --base origin/main
// Run the --as form before every push. Commit first: it reads commits, not the working tree.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const owners = JSON.parse(readFileSync(join(here, "owners.json"), "utf8"));
const PAIR = ["role-1", "role-3"];
const STATUSES = ["proposed", "changes-requested", "approved", "rejected", "merged"];
const APPROVED = ["approved", "merged"];
const SHA = /^[0-9a-f]{7,40}$/;
const errors = [];
const notes = [];

const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const flag = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
};

// The gap ids that exist. A proposal that names anything else has a typo.
const gapIds = new Set(
  [...readFileSync(join(here, "GAPS.md"), "utf8").matchAll(/^\|\s*((?:G|M|S|D)-\d{2})\s*\|/gm)].map((m) => m[1]),
);

// The role whose longest matching prefix covers this path. No match: "unowned".
function ownerOf(file) {
  let best = { role: "unowned", len: -1 };
  for (const [role, prefixes] of Object.entries(owners)) {
    if (role.startsWith("_")) continue;
    for (const p of prefixes) {
      if (file.startsWith(p) && p.length > best.len) best = { role, len: p.length };
    }
  }
  return best.role;
}

// Only the fields this check reads. Lists are `[a, b]` or one `  - item` per line. No comments in frontmatter.
function parseFront(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const meta = {};
  let key = null;
  for (const line of m[1].split("\n")) {
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && key) {
      if (!Array.isArray(meta[key])) meta[key] = [];
      meta[key].push(item[1].trim());
      continue;
    }
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!kv) continue;
    key = kv[1];
    const v = kv[2].trim();
    if (v === "") meta[key] = "";
    else if (v.startsWith("[")) meta[key] = v.slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean);
    else meta[key] = v.replace(/^["']|["']$/g, "");
  }
  return meta;
}

function proposals() {
  const dir = join(here, "proposals");
  return readdirSync(dir)
    .filter((f) => /^P-\d{3}-[a-z0-9-]+\.md$/.test(f))
    .map((file) => ({ file, meta: parseFront(readFileSync(join(dir, file), "utf8")) }));
}

function validate({ file, meta }) {
  if (!meta) return errors.push(`${file}: no frontmatter`);
  const id = file.slice(0, 5);
  const reviewer = PAIR.find((r) => r !== meta.author) ?? "role-1";
  if (meta.id !== id) errors.push(`${file}: id must be ${id}`);
  if (!PAIR.includes(meta.author)) errors.push(`${file}: author must be role-1 or role-3`);
  if (meta.reviewer !== reviewer) errors.push(`${file}: reviewer must be ${reviewer}, the other role`);
  if (!STATUSES.includes(meta.status)) errors.push(`${file}: status "${meta.status}" is not one of ${STATUSES.join(", ")}`);
  if (!Array.isArray(meta.gaps) || meta.gaps.length === 0) errors.push(`${file}: gaps is empty`);
  for (const g of Array.isArray(meta.gaps) ? meta.gaps : []) {
    if (!gapIds.has(g)) errors.push(`${file}: ${g} is not a gap id in GAPS.md`);
  }
  if (!Array.isArray(meta.files) || meta.files.length === 0) errors.push(`${file}: files is empty`);
  if (APPROVED.includes(meta.status)) {
    if (meta.approved_by !== reviewer) errors.push(`${file}: approved_by must be ${reviewer}`);
    if (!SHA.test(meta.approved_sha ?? "")) errors.push(`${file}: approved_sha must be the commit the reviewer read`);
  }
}

// A change to a file owned by the other role needs an approved proposal from that owner, at the current code commit.
function changedCheck(as, base) {
  if (!PAIR.includes(as)) return errors.push("--as must be role-1 or role-3");
  let files;
  let codeHead;
  try {
    files = git("diff", "--name-only", `${base}...HEAD`).split("\n").filter(Boolean);
    // The reviewer approves a code commit. A commit that only touches proposals/ does not move it,
    // so the approval commit itself never voids the approval.
    codeHead = git("log", "-1", "--format=%H", `${base}..HEAD`, "--", ".", ":(exclude)api_front_back_gap/proposals")
      || git("rev-parse", "HEAD");
  } catch {
    return errors.push(`cannot diff against ${base}. Run git fetch, or pass --base <ref>`);
  }
  if (files.length === 0) notes.push(`no commits against ${base}`);
  const live = proposals().filter((p) => p.meta && APPROVED.includes(p.meta.status));
  for (const file of files) {
    const owner = ownerOf(file);
    if (owner === "shared" || owner === as) continue;
    if (!PAIR.includes(owner)) {
      notes.push(`${file}: owned by ${owner}, outside this system. Ask ${owner} in chat`);
      continue;
    }
    const covered = live.some(({ meta: m }) =>
      m.author === as && m.reviewer === owner && m.approved_by === owner &&
      SHA.test(m.approved_sha) && codeHead.startsWith(m.approved_sha) &&
      m.files.some((f) => file.startsWith(f)));
    if (!covered) {
      errors.push(`${file} is owned by ${owner}. Needs a proposal from ${as} that ${owner} approved at ${codeHead.slice(0, 7)}`);
    }
  }
}

const all = proposals();
for (const p of all) validate(p);
if (flag("--as")) changedCheck(flag("--as"), flag("--base") ?? "origin/main");
for (const n of notes) console.log(`note  ${n}`);
for (const e of errors) console.log(`FAIL  ${e}`);
if (errors.length) process.exit(1);
console.log(`ok    ${all.length} proposal(s), ${gapIds.size} gap ids${flag("--as") ? `, branch checked as ${flag("--as")}` : ""}`);
