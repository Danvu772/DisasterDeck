// Picks the desk the agents talk to:
//   DESK_BACKEND=lib|http|fixture forces one. Otherwise:
//   MONGODB_URI set  → Role 1's lib/db.ts functions, same process (the real desk)
//   DESK_API_URL set → Role 1's HTTP API (a desk on another machine)
//   neither          → fake data from fixtures/ and data/seed.json
import { fixtureDesk } from "./fixture-desk";
import { httpDesk } from "./http-desk";
import { libDesk } from "./lib-desk";
import type { DeskPort } from "./port";

export function desk(): DeskPort {
  const forced = process.env.DESK_BACKEND;
  if (forced === "lib") return libDesk;
  if (forced === "http") return httpDesk;
  if (forced === "fixture") return fixtureDesk;
  if (process.env.MONGODB_URI) return libDesk;
  if (process.env.DESK_API_URL) return httpDesk;
  return fixtureDesk;
}

export * from "./port";
