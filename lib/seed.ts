// Load Role 4's data/seed.json into the database: users only. Shelters arrive through the event queue (D-0017).
// Run: npm run db:seed. Safe to run again: each document is replaced by its _id.
// It does not touch events, tasks or any other record.
// The desk defaults to seed.json's own; pass --desk <id> or DESK_ID to seed a throwaway desk
// (ids get prefixed with the desk, so they never collide with the shared desk's).
import { readFile } from "node:fs/promises";
import { bumpDeskVersion, closeDb, cols } from "./db";
import type { User } from "./types";

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

/** The ids are global, so a seed for any other desk gets its ids prefixed with the desk id. */
export async function seed(desk?: string): Promise<{ deskId: string; users: number }> {
  const file = JSON.parse(await readFile(new URL("../data/seed.json", import.meta.url), "utf8")) as {
    deskId: string; users: Json[];
  };
  const target = desk ?? file.deskId;
  const id = (raw: unknown) => (target === file.deskId ? String(raw) : `${target}:${raw}`);
  const { users } = await cols();

  for (const u of file.users) {
    const user = { ...withDates<User>(u, ["lastSeen"]), _id: id(u._id), deskId: target };
    await users.replaceOne({ _id: user._id }, user, { upsert: true });
  }
  await bumpDeskVersion(target);
  return { deskId: target, users: file.users.length };
}

async function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf("--desk");
  const desk = (i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : undefined)
    ?? process.env.DESK_ID;
  const r = await seed(desk);
  console.log(`Seeded desk ${r.deskId}: ${r.users} users.`);
}

// Only when run as a script (npm run db:seed), not when reset.ts imports seed().
if (process.argv[1] && /[\\/]seed\.ts$/.test(process.argv[1])) {
  main()
    .catch((err) => {
      console.error("Seed failed:", err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(closeDb);
}
