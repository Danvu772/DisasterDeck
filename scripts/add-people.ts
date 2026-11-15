// More people on a desk, so the coordinator's "Send someone else" has a real choice: three more
// field teams, four more volunteers, one more supplier. npm run db:people [-- --dry-run]
// They are placed around the people already on DESK_ID (the middle of their positions), so the
// same list works on any seeded desk. Only people who are not there yet are
// written: an existing person, their position and their lastSeen are never touched. Never seen,
// so the dispatcher does not pick them by itself (R1-1). A coordinator can still send them.
import { configuredDeskId } from "../lib/pilot";
import { pathToFileURL } from "node:url";
import { bumpDeskVersion, closeDb, cols } from "../lib/db";
import type { LatLng, User } from "../lib/types";

type Person = Omit<User, "deskId" | "region" | "coords" | "lastSeen"> & { north: number; east: number };

// Offsets in meters from the middle of the desk's people.
const PEOPLE: Person[] = [
  { _id: "field-bravo", name: "Saha Ekibi B", role: "field", status: "available", trust: "official", north: 900, east: -600,
    profile: { vehicle: "van", skills: ["field_response", "first_aid"] } },
  { _id: "field-charlie", name: "Saha Ekibi C", role: "field", status: "available", trust: "official", north: -1200, east: 800,
    profile: { vehicle: "truck", skills: ["field_response", "heavy_lifting"] } },
  { _id: "field-delta", name: "Saha Ekibi D", role: "field", status: "available", trust: "official", north: 300, east: 1800,
    profile: { vehicle: "van", skills: ["field_response", "search_dog"] } },
  { _id: "volunteer-elif", name: "Elif", role: "volunteer", status: "available", trust: "vetted", north: -400, east: -300,
    profile: { vehicle: "car", skills: ["first_aid", "callback"] } },
  { _id: "volunteer-murat", name: "Murat", role: "volunteer", status: "available", trust: "vetted", north: 600, east: 400,
    profile: { vehicle: "none", skills: ["callback"] } },
  { _id: "volunteer-deniz", name: "Deniz", role: "volunteer", status: "available", trust: "vetted", north: -800, east: -1100,
    profile: { vehicle: "car", skills: ["arabic", "callback"] } },
  { _id: "volunteer-kerem", name: "Kerem", role: "volunteer", status: "available", trust: "public", north: 1400, east: 200,
    profile: { vehicle: "van", skills: ["driving"] } },
  { _id: "supplier-third", name: "Demo Depo C", role: "supplier", status: "available", trust: "vetted", north: -1500, east: -500,
    profile: { vehicle: "truck", skills: [], stock: { blankets: 80, water: 300, tents: 25 } } },
];

function moved([lat, lng]: LatLng, north: number, east: number): LatLng {
  const dLat = north / 111_320;
  const dLng = east / (111_320 * Math.cos((lat * Math.PI) / 180));
  return [Number((lat + dLat).toFixed(5)), Number((lng + dLng).toFixed(5))];
}

export async function addPeople(deskId: string, dryRun = false): Promise<{ added: string[]; there: string[] }> {
  const { users } = await cols();
  const crew = await users.find({ deskId }).toArray();
  const placed = crew.filter((u) => u.coords);
  if (!placed.length) throw new Error(`nobody with a position on ${deskId}: seed the desk first`);
  const mid: LatLng = [
    placed.reduce((a, u) => a + u.coords![0], 0) / placed.length,
    placed.reduce((a, u) => a + u.coords![1], 0) / placed.length,
  ];
  const regions = new Map<string, number>();
  for (const u of crew) regions.set(u.region, (regions.get(u.region) ?? 0) + 1);
  const region = [...regions].sort((a, b) => b[1] - a[1])[0][0];
  // A desk other than the one these ids were written for gets them prefixed, like lib/seed.ts does.
  const prefixed = crew.some((u) => u._id.startsWith(`${deskId}:`));
  const added: string[] = [];
  const there: string[] = [];
  for (const { north, east, ...p } of PEOPLE) {
    const _id = prefixed ? `${deskId}:${p._id}` : p._id;
    const user: User = { ...p, _id, deskId, region, coords: moved(mid, north, east) };
    if (dryRun) {
      ((await users.findOne({ _id }, { projection: { _id: 1 } })) ? there : added).push(_id);
      continue;
    }
    const r = await users.updateOne({ _id }, { $setOnInsert: user }, { upsert: true });
    (r.upsertedCount ? added : there).push(_id);
  }
  if (added.length && !dryRun) await bumpDeskVersion(deskId);
  return { added, there };
}

async function main() {
  const deskId = configuredDeskId();
  const dryRun = process.argv.includes("--dry-run");
  const r = await addPeople(deskId, dryRun);
  console.log(`${dryRun ? "Would add" : "Added"} ${r.added.length} on ${deskId}: ${r.added.join(", ") || "nobody"}`);
  if (r.there.length) console.log(`Already there, left alone: ${r.there.join(", ")}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((err) => { console.error("add-people failed:", err instanceof Error ? err.message : err); process.exitCode = 1; })
    .finally(closeDb);
}
