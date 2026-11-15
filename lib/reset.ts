// Wipe one desk and reseed it, so the demo can be run again: npm run db:reset -- --desk <id>
//   --dry-run                      count only, delete nothing
//   --yes-wipe-the-shared-desk     required as well when the desk is the real one
// Deletes that desk's documents in events, sites, needs, roads, shelters, zones, incidents,
// tasks and users, the inbox items and chat messages of those users, and the desk's counters in
// meta (cases, version). Never drops a collection or an index, never touches another desk or the
// Brain's heartbeat and lease. Then reseeds users and shelters from data/seed.json.
import { closeDb, cols, deskId } from "./db";
import { seed } from "./seed";

/** Desks nobody may wipe by accident: the configured one, the demo ones and the seed file's own. */
const SHARED = () => new Set([deskId(), process.env.DESK_ID ?? "", "malatya-2023", "antakya-2023"].filter(Boolean));

export async function wipeDesk(desk: string, opts: { dryRun?: boolean } = {}): Promise<Record<string, number>> {
  if (!desk) throw new Error("wipeDesk needs a desk id");
  const c = await cols();
  const filter = { deskId: desk };
  const userIds = (await c.users.find(filter, { projection: { _id: 1 } }).toArray()).map((u) => u._id);
  const metaIds = [`cases:${desk}`, `version:${desk}`];
  const targets = [
    ["events", c.events], ["sites", c.sites], ["needs", c.needs], ["roads", c.roads], ["shelters", c.shelters],
    ["zones", c.zones], ["incidents", c.incidents], ["tasks", c.tasks], ["users", c.users],
  ] as const;
  const counts: Record<string, number> = {};
  for (const [name, col] of targets) counts[name] = await col.countDocuments(filter);
  counts.inbox = userIds.length ? await c.inbox.countDocuments({ userId: { $in: userIds } }) : 0;
  counts.messages = userIds.length ? await c.messages.countDocuments({ userId: { $in: userIds } }) : 0;
  counts.meta = await c.meta.countDocuments({ _id: { $in: metaIds } });
  if (opts.dryRun) return counts;

  // People first: the lookup above is what ties inbox and messages to this desk.
  if (userIds.length) {
    await c.inbox.deleteMany({ userId: { $in: userIds } });
    await c.messages.deleteMany({ userId: { $in: userIds } });
  }
  for (const [, col] of targets) await (col as { deleteMany(f: object): Promise<unknown> }).deleteMany(filter);
  await c.meta.deleteMany({ _id: { $in: metaIds } });
  return counts;
}

async function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf("--desk");
  const desk = i >= 0 ? args[i + 1] : undefined;
  const dryRun = args.includes("--dry-run");
  if (!desk || desk.startsWith("--")) throw new Error("Refusing to run: pass --desk <id> (there is no default).");
  if (SHARED().has(desk) && !dryRun && !args.includes("--yes-wipe-the-shared-desk")) {
    throw new Error(`Refusing to wipe "${desk}": it is the shared desk. Add --yes-wipe-the-shared-desk if you mean it.`);
  }
  const counts = await wipeDesk(desk, { dryRun: true });
  console.log(`${dryRun ? "Would delete" : "Deleting"} from desk "${desk}":`);
  for (const [k, n] of Object.entries(counts)) console.log(`  ${k.padEnd(10)} ${n}`);
  if (dryRun) return console.log("Dry run: nothing deleted.");
  await wipeDesk(desk);
  const r = await seed(desk);
  console.log(`Reseeded desk ${desk}: ${r.users} users, ${r.shelters} shelters.`);
}

if (process.argv[1] && /[\\/]reset\.ts$/.test(process.argv[1])) {
  main()
    .catch((err) => {
      console.error("Reset failed:", err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(closeDb);
}
