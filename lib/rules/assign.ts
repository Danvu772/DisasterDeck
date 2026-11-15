// Owned by Role 1. Who gets a task (Final system design §5, "Picking a person"). Pure: the
// dispatcher loads the people and their open task counts, this decides.
// A candidate passes every line, in this order:
//   1. a role that fits the task
//   2. has what the task needs (a supplier's stock for a delivery)
//   3. free: status available, seen in the last 3 minutes (when we know), fewer than 3 open tasks
//   4. not in the task's tried list
// Among those: nearest first (straight line, or the same region when a position is missing),
// then fewest open tasks. Nobody passes: the reason says which line stopped each person.
import { haversineMeters } from "../geo";
import type { LatLng, Role, User } from "../types";

export const SEEN_WITHIN_MS = 3 * 60_000;
export const MAX_OPEN_TASKS = 3;

export interface Place { coords?: LatLng; region: string }

export type Pick =
  | { ok: true; user: User; meters?: number }
  | { ok: false; reason: string };

export function pickPerson(
  users: User[],
  openTasks: Map<string, number>,
  place: Place,
  need: { roles: Role[]; exclude: string[]; has?: (u: User) => boolean; what?: string },
  now: Date = new Date(),
): Pick {
  const out = { role: 0, has: 0, busy: 0, unseen: 0, full: 0, tried: 0 };
  const fits: User[] = [];
  for (const u of users) {
    if (!need.roles.includes(u.role)) { out.role++; continue; }
    if (need.has && !need.has(u)) { out.has++; continue; }
    if (u.status !== "available") { out.busy++; continue; }
    if (u.lastSeen && now.getTime() - new Date(u.lastSeen).getTime() > SEEN_WITHIN_MS) { out.unseen++; continue; }
    if ((openTasks.get(u._id) ?? 0) >= MAX_OPEN_TASKS) { out.full++; continue; }
    if (need.exclude.includes(u._id)) { out.tried++; continue; }
    fits.push(u);
  }

  if (!fits.length) {
    const who = need.roles.join(" or ");
    const parts = [
      out.has && `${out.has} without ${need.what ?? "what it needs"}`,
      out.busy && `${out.busy} busy or offline`,
      out.unseen && `${out.unseen} not seen in 3 minutes`,
      out.full && `${out.full} with ${MAX_OPEN_TASKS} open tasks`,
      out.tried && `${out.tried} already asked`,
    ].filter(Boolean);
    const seen = users.length - out.role;
    return {
      ok: false,
      reason: seen
        ? `nobody fits: ${seen} ${who} on the desk, ${parts.join(", ")}`
        : `nobody fits: no ${who} on the desk`,
    };
  }

  const meters = (u: User) => (place.coords && u.coords ? haversineMeters(place.coords, u.coords) : undefined);
  // Known distance first, then same region, then the rest. Ties: fewest open tasks.
  const rank = (u: User) => {
    const m = meters(u);
    return m !== undefined ? m : u.region === place.region ? 1e9 : 2e9;
  };
  const best = [...fits].sort((a, b) => rank(a) - rank(b) || (openTasks.get(a._id) ?? 0) - (openTasks.get(b._id) ?? 0))[0];
  return { ok: true, user: best, meters: meters(best) };
}

/** "600 m" or "2.4 km", for task details. */
export function distanceText(meters: number): string {
  return meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1)} km`;
}

/** Item names compared loosely: case, Turkish letters and a plural "s" do not count. */
export function sameItem(a: string, b: string): boolean {
  const key = (s: string) => s.toLocaleLowerCase("tr").trim().replace(/\s+/g, " ").replace(/s$/, "");
  return key(a) === key(b);
}

/** How many of `item` this supplier has, 0 when none. */
export function stockOf(u: User, item: string): number {
  const stock = u.profile?.stock ?? {};
  return Object.entries(stock).find(([k]) => sameItem(k, item))?.[1] ?? 0;
}
