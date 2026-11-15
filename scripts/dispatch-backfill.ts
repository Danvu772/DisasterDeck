// One-time dispatcher backfill: npm run dispatch:backfill [-- --dry-run] [-- --seed-need]
// Records that arrived before the dispatcher existed never got their tasks: the dispatcher only
// reacts to changes. This replays every open site and need of DESK_ID through the dispatcher's
// own react(), exactly as if the keeper had just changed it. The rules decide, nothing is written
// by hand. Also retracts the db:check test record (#31) through a correction event, and with
// --seed-need posts one need (20 blankets) for the supplier. Running it twice changes nothing
// (the one_open_task index, dedupe keys). Only DESK_ID is touched. Nothing is deleted.
import { pathToFileURL } from "node:url";
import { closeDb, cols, postEvent } from "../lib/db";
import { haversineMeters } from "../lib/geo";
import { pickPerson } from "../lib/rules/assign";
import type { CorrectionPayload, Need, NeedPayload, Site, Task, User } from "../lib/types";
import { react } from "../workers/dispatcher";
import type { Change } from "../workers/memory-keeper";

const RETRACT_REASON = "Test record from db:check, not a real report (#31)";
const SEED_KEY = "demo:need:blankets:1";
const SEED = { item: "blankets", quantity: 20, lifeThreatening: true };
const OPEN_NEED: Need["status"][] = ["open", "assigned", "on_the_way"];

const isTestRecord = (s: Site) => s.history.some((h) => h.by === "db-check");
const retractKey = (s: Site) => `backfill:retract:${s._id}`;
const label = (s: Site) => (s.caseNo ? `site ${s.caseNo} (${s._id})` : s._id);

interface Plan {
  retract: Site[];
  sites: Site[];
  needs: Need[];
  skipped: { id: string; why: string }[];
  expect: { recordId: string; type: Task["type"]; to: string }[];
  seed?: { actor: string; site: Site; meters: number } | { skip: string };
}

async function plan(desk: string, seedNeed: boolean): Promise<Plan> {
  const c = await cols();
  const [sites, needs, users, open] = await Promise.all([
    c.sites.find({ deskId: desk }).toArray(),
    c.needs.find({ deskId: desk }).toArray(),
    c.users.find({ deskId: desk }).toArray(),
    c.tasks.find({ deskId: desk, open: true }).toArray(),
  ]);
  const has = (recordId: string, type: Task["type"]) => open.some((t) => t.recordId === recordId && t.type === type);
  const p: Plan = { retract: [], sites: [], needs: [], skipped: [], expect: [] };

  // What the dispatcher will most likely pick, for the plan only. The real run asks the dispatcher.
  const counts = new Map<string, number>();
  for (const t of open) if (t.assignee) counts.set(t.assignee, (counts.get(t.assignee) ?? 0) + 1);
  const guess = (role: User["role"], s: Site) => {
    const pick = pickPerson(users, counts, { coords: s.coords, region: s.region }, { roles: [role], exclude: [] });
    if (!pick.ok) return `nobody, escalated (${pick.reason})`;
    counts.set(pick.user._id, (counts.get(pick.user._id) ?? 0) + 1);
    return `${pick.user._id}${pick.meters !== undefined ? `, ${(pick.meters / 1000).toFixed(1)} km away` : ""}`;
  };

  for (const s of sites) {
    if (s.status === "retracted" || s.status === "closed") { p.skipped.push({ id: label(s), why: `site is ${s.status}` }); continue; }
    if (isTestRecord(s)) {
      const old = await c.events.findOne({ dedupeKey: retractKey(s) }, { projection: { status: 1 } });
      if (old) p.skipped.push({ id: label(s), why: `test record, its retraction was posted already (event ${old._id}, ${old.status})` });
      else p.retract.push(s);
      continue;
    }
    const wantsCall = s.callStatus === "not_called" && s.status === "open";
    const wantsRescue = s.callStatus === "verified" && s.peopleTrapped > 0 && s.status !== "team_on_site";
    if (!wantsCall && !wantsRescue) { p.skipped.push({ id: label(s), why: `no rule fits (call ${s.callStatus}, status ${s.status}, ${s.peopleTrapped} trapped)` }); continue; }
    if (wantsCall && has(s._id, "call")) p.skipped.push({ id: label(s), why: "already has an open call task" });
    if (wantsRescue && has(s._id, "rescue")) p.skipped.push({ id: label(s), why: "already has an open rescue task" });
    if (wantsCall && !has(s._id, "call")) p.expect.push({ recordId: label(s), type: "call", to: guess("volunteer", s) });
    if (wantsRescue && !has(s._id, "rescue")) p.expect.push({ recordId: label(s), type: "rescue", to: `waiting for a coordinator, proposed team ${guess("field", s)}` });
    p.sites.push(s);
  }
  for (const n of needs) {
    if (!OPEN_NEED.includes(n.status)) { p.skipped.push({ id: n._id, why: `need is ${n.status}` }); continue; }
    if (n.status !== "open") { p.skipped.push({ id: n._id, why: `need is ${n.status}, it has its supplier` }); continue; }
    if (has(n._id, "deliver")) { p.skipped.push({ id: n._id, why: "already has an open deliver task" }); continue; }
    p.expect.push({ recordId: n._id, type: "deliver", to: "the nearest supplier with the stock" });
    p.needs.push(n);
  }

  if (seedNeed) {
    const field = users.find((u) => u._id === "field-alpha") ?? users.find((u) => u.role === "field");
    const near = field?.coords
      ? p.sites.filter((s) => s.coords).map((s) => ({ s, m: haversineMeters(field.coords!, s.coords!) })).sort((a, b) => a.m - b.m)[0]
      : undefined;
    const old = await c.events.findOne({ dedupeKey: SEED_KEY }, { projection: { deskId: 1 } });
    if (old) p.seed = { skip: old.deskId === desk ? `already posted (event ${old._id})` : `the key ${SEED_KEY} is taken by desk ${old.deskId}, nothing posted` };
    else if (!field) p.seed = { skip: "no field team on this desk" };
    else if (!near) p.seed = { skip: `no open site with a position near ${field._id}` };
    else p.seed = { actor: field._id, site: near.s, meters: near.m };
  }
  return p;
}

function print(desk: string, p: Plan, dry: boolean): void {
  console.log(`Desk ${desk}${dry ? ", dry run, nothing is written" : ""}`);
  console.log(`Retract ${p.retract.length} test record(s) as coordinator-duty:`);
  for (const s of p.retract) console.log(`  ${label(s)}, ${s.address || "no address"}, reason "${RETRACT_REASON}"`);
  console.log(`Replay ${p.sites.length} site(s) and ${p.needs.length} need(s) through the dispatcher. It will most likely make:`);
  for (const e of p.expect) console.log(`  ${e.type} task for ${e.recordId}, to ${e.to}`);
  if (!p.expect.length) console.log("  nothing");
  if (p.seed) {
    console.log("Seed need:");
    if ("skip" in p.seed) console.log(`  skipped, ${p.seed.skip}`);
    else console.log(`  ${SEED.quantity} ${SEED.item}, life-threatening, at ${label(p.seed.site)} (${(p.seed.meters / 1000).toFixed(1)} km from ${p.seed.actor}), posted as ${p.seed.actor}, key ${SEED_KEY}. The Brain makes the need and its deliver task.`);
  }
  console.log(`Skip ${p.skipped.length} record(s):`);
  for (const s of p.skipped) console.log(`  ${s.id}, ${s.why}`);
}

async function main(): Promise<void> {
  const desk = process.env.DESK_ID;
  if (!desk) {
    console.error("DESK_ID is not set. Set it to the desk to backfill, for example DESK_ID=antakya-2023.");
    process.exit(1);
  }
  const dry = process.argv.includes("--dry-run");
  const seedNeed = process.argv.includes("--seed-need");
  const p = await plan(desk, seedNeed);
  print(desk, p, dry);
  if (dry) return;

  const c = await cols();
  const before = new Set((await c.tasks.find({ deskId: desk }, { projection: { _id: 1 } }).toArray()).map((t) => t._id));
  const posted: string[] = [];

  for (const s of p.retract) {
    const id = await postEvent<CorrectionPayload>({
      deskId: desk, type: "correction", source: "person", actor: "coordinator-duty", dedupeKey: retractKey(s),
      payload: { action: "retract", recordType: "site", recordId: s._id, reason: RETRACT_REASON },
    });
    posted.push(`correction ${id}, retract ${label(s)}`);
  }

  // The same Change objects the keeper hands the dispatcher after an update.
  const changes: Change[] = [
    ...p.sites.map((s): Change => ({ recordType: "site", recordId: s._id, op: "updated", eventId: `backfill:${s._id}`, fields: ["status"] })),
    ...p.needs.map((n): Change => ({ recordType: "need", recordId: n._id, op: "updated", eventId: `backfill:${n._id}`, fields: ["status"] })),
  ];
  await react(changes);

  if (p.seed && !("skip" in p.seed)) {
    const id = await postEvent<NeedPayload>({
      deskId: desk, type: "need", source: "person", actor: p.seed.actor, dedupeKey: SEED_KEY,
      payload: { ...SEED, siteId: p.seed.site._id },
    });
    posted.push(`need ${id}, ${SEED.quantity} ${SEED.item} at ${label(p.seed.site)}`);
  }

  const made = (await c.tasks.find({ deskId: desk }).toArray()).filter((t) => !before.has(t._id));
  const inboxNew = await c.inbox.countDocuments({ taskId: { $in: made.map((t) => t._id) } });
  const per = new Map<string, string[]>();
  for (const t of made) {
    const who = t.assignee ?? (t.status === "waiting_approval" ? "coordinators (waiting for approval)" : `nobody (${t.status})`);
    per.set(who, [...(per.get(who) ?? []), `${t.type} ${t._id} for ${t.recordId}`]);
  }
  console.log("\nDone.");
  console.log(`Tasks created: ${made.length}`);
  for (const [who, list] of per) console.log(`  ${who}: ${list.length}, ${list.join(", ")}`);
  console.log(`Inbox items written: ${inboxNew}`);
  console.log(`Events posted: ${posted.length}`);
  for (const e of posted) console.log(`  ${e}`);
  console.log(`Records skipped: ${p.skipped.length}${p.skipped.length ? ", reasons above" : ""}`);
  if (changes.length && !made.length) console.log("Every replayed record already had its open task, nothing new.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then(() => closeDb())
    .catch(async (err) => {
      console.error("[dispatch-backfill] failed:", err);
      await closeDb();
      process.exit(1);
    });
}
