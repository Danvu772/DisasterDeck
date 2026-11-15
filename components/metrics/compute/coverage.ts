// coverage, after Church and ReVelle 1974 (maximal covering location problem): the share of open
// sites with an available field team or volunteer inside the service radius.
// Radius: 10 min at 20 km/h, our stated guess for driving through rubble in a city, so 3.3 km.
// Distance is great-circle, which is shorter than the real road distance (stated in the basis).
import type { LatLng, User } from "@/lib/types";
import type { MetricResult } from "../types";
import type { MetricInput } from "../registry";
import { plural, unknown } from "./shared";

const SOURCE = { name: "Church and ReVelle 1974, the maximal covering location problem", url: "https://www.geog.ucsb.edu/~forest/G294download/MAX_COVER_RRV_CC.pdf" };
const TITLE = "Open sites with a free unit within reach";
const SPEED_KMH = 20;
const REACH_MIN = 10;
const RADIUS_KM = (SPEED_KMH * REACH_MIN) / 60;
const UNIT_ROLES = new Set<User["role"]>(["field", "volunteer"]);

export function km([lat1, lng1]: LatLng, [lat2, lng2]: LatLng): number {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2
    + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lng2 - lng1) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

export function compute({ board, users, now }: MetricInput): MetricResult {
  const open = board.sites.filter((s) => s.status === "open");
  if (!users) {
    return unknown("coverage", TITLE, SOURCE,
      "Needs user positions from GET /api/users, Role 1, issue #2.",
      `${plural(open.length, "open site")}, no user list`, now);
  }
  const placed = open.filter((s) => s.coords);
  const units = users.filter((u) => UNIT_ROLES.has(u.role) && u.status === "available" && u.coords);
  if (!placed.length) {
    return unknown("coverage", TITLE, SOURCE,
      open.length ? "No open site has coordinates yet. Coordinates come from the memory keeper's geocoding, Role 1." : "There are no open sites to cover.",
      `${plural(open.length, "open site")}, none with coordinates`, now);
  }

  const reach = placed.map((s) => {
    const near = units.map((u) => ({ u, d: km(s.coords!, u.coords!) })).sort((a, b) => a.d - b.d)[0];
    return { s, near, covered: !!near && near.d <= RADIUS_KM };
  });
  const covered = reach.filter((r) => r.covered);
  const gaps = reach.filter((r) => !r.covered).sort((a, b) => a.s.tier - b.s.tier || b.s.priority - a.s.priority);
  const gapDanger = gaps.filter((g) => g.s.tier === 0);

  const gapText = gaps.slice(0, 2).map((g) =>
    g.near ? `${g.s.address} (nearest free unit ${g.near.d.toFixed(1)} km away)` : g.s.address).join(" and ");
  const headline = `${covered.length} of ${plural(placed.length, "open site")} ${covered.length === 1 ? "has" : "have"} a free team or volunteer within ${REACH_MIN} min.${
    gaps.length ? ` Not covered: ${gapText}${gaps.length > 2 ? `, and ${gaps.length - 2} more` : ""}.` : ""}`;

  return {
    id: "coverage", title: TITLE, source: SOURCE, computedAt: now,
    status: gapDanger.length ? "act" : gaps.length ? "warn" : "ok",
    headline,
    chart: {
      kind: "gauge", unit: "sites",
      point: { label: "Open sites covered", value: covered.length, max: placed.length,
        tone: gapDanger.length ? "act" : gaps.length ? "warn" : "ok",
        note: `radius ${RADIUS_KM.toFixed(1)} km, ${REACH_MIN} min at ${SPEED_KMH} km/h` },
    },
    basis: [
      `from ${plural(placed.length, "open site")} and ${plural(units.length, "free unit")} with a position`,
      open.length > placed.length ? `${open.length - placed.length} without coordinates left out` : "",
      "straight-line distance, roads are longer",
    ].filter(Boolean).join(", "),
  };
}
