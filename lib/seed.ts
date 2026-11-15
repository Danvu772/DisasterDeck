// Load Role 4's data/seed.json into the database: users and shelters.
// Run: npm run db:seed. Safe to run again: each document is replaced by its _id.
// It does not touch events, tasks or any other record.
import { readFile } from "node:fs/promises";
import { closeDb, cols } from "./db";
import type { Shelter, User } from "./types";

type Json = Record<string, unknown>;

// JSON has no dates. Turn the known date fields back into Date objects.
function withDates<T>(doc: Json, fields: string[]): T {
  const out: Json = { ...doc };
  for (const f of fields) if (typeof out[f] === "string") out[f] = new Date(out[f] as string);
  if (Array.isArray(out.history)) {
    out.history = out.history.map((h: Json) => ({ ...h, ts: new Date(h.ts as string) }));
  }
  return out as T;
}

async function main() {
  const seed = JSON.parse(await readFile(new URL("../data/seed.json", import.meta.url), "utf8")) as {
    deskId: string; users: Json[]; shelters: Json[];
  };
  const { users, shelters } = await cols();

  for (const u of seed.users) {
    const user = withDates<User>(u, ["lastSeen"]);
    await users.replaceOne({ _id: user._id }, user, { upsert: true });
  }
  for (const s of seed.shelters) {
    const shelter = withDates<Shelter>(s, ["observedAt", "updated"]);
    await shelters.replaceOne({ _id: shelter._id }, shelter, { upsert: true });
  }
  console.log(`Seeded desk ${seed.deskId}: ${seed.users.length} users, ${seed.shelters.length} shelters.`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(closeDb);
