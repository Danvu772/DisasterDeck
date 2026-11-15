// Read only: how the Brain handled the events our agents posted. No writes, no model call.
//   npx tsx --env-file=.env.local agents/scripts/events-check.ts
// Counts by type / actor / status, then every rejected or failed event with the Brain's reason.

import { closeDb, cols } from "../../lib/db";

const AGENTS = ["x-agent", "news-agent", "official-agent", "sheet-agent", "quake-watcher"];

async function main() {
  const { events, users } = await cols();
  const people = (await users.find({}, { projection: { _id: 1 } }).toArray()).map((u) => u._id);
  const ours = { $or: [{ actor: { $in: AGENTS } }, { source: "person" as const, actor: { $in: people } }] };

  const groups = await events.aggregate<{ _id: { type: string; actor: string; status: string }; n: number }>([
    { $match: ours },
    { $group: { _id: { type: "$type", actor: "$actor", status: "$status" }, n: { $sum: 1 } } },
    { $sort: { "_id.type": 1, "_id.actor": 1 } },
  ]).toArray();
  console.log("type      actor                 status     count");
  for (const g of groups) console.log(`${g._id.type.padEnd(9)} ${g._id.actor.padEnd(21)} ${g._id.status.padEnd(10)} ${g.n}`);

  const bad = await events.find({ ...ours, status: { $in: ["rejected", "failed"] } }).sort({ ts: -1 }).limit(25).toArray();
  console.log(`\nrejected or failed (${bad.length}):`);
  for (const e of bad) {
    console.log(`  ${e.type} from ${e.actor} · ${e.status} · ${e.result?.reason ?? "(no reason)"}`);
    console.log(`    payload: ${JSON.stringify(e.payload).slice(0, 160)}`);
  }

  const done = await events.find({ ...ours, status: { $in: ["done", "merged"] } }).sort({ ts: -1 }).limit(8).toArray();
  console.log(`\nlatest accepted (${done.length}):`);
  for (const e of done) console.log(`  ${e.type} from ${e.actor} · ${e.status} · ${e.result?.reason ?? ""}`);
  await closeDb();
}

main().catch(async (e) => { console.error(e); await closeDb(); process.exit(1); });
