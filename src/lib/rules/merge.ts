// Owned by Role 1. Which site does a report belong to? Pure: the memory keeper loads the
// candidates, this decides, the keeper writes. Rules, in this order (Role 1 task 2):
//   1. same text as an earlier report → a copy of that site: adds a source, not support
//   2. a site within MERGE_RADIUS_M, or with the same normalized address → the same site
//   3. otherwise a new site (only for "trapped" and "missing"; an update needs a site)
import { haversineMeters, normalizeAddress } from "../geo";
import type { LatLng, ReportPayload } from "../types";

export const MERGE_RADIUS_M = 100;

/** The fields of a site the merge rules look at. */
export interface SiteLite { _id: string; address: string; coords?: LatLng }

export type ReportDecision =
  | { action: "new"; reason: string }
  | { action: "merge"; siteId: string; copy: boolean; reason: string }
  | { action: "reject"; reason: string };

export function decideReport(
  p: ReportPayload,
  ctx: {
    sites: SiteLite[];              // open sites on this desk (not retracted)
    copyOfSiteId?: string;          // site of an earlier report with the same text, if any
    siteExists?: boolean;           // when p.siteId is set: is it a live site?
  },
): ReportDecision {
  // A person or agent that names the site wins over every rule.
  if (p.siteId) {
    return ctx.siteExists
      ? { action: "merge", siteId: p.siteId, copy: false, reason: `names site ${p.siteId}` }
      : { action: "reject", reason: `site ${p.siteId} does not exist or was retracted` };
  }

  if (ctx.copyOfSiteId) {
    return { action: "merge", siteId: ctx.copyOfSiteId, copy: true, reason: "same text as an earlier report: a copy" };
  }

  if (p.coords) {
    let best: { site: SiteLite; meters: number } | undefined;
    for (const site of ctx.sites) {
      if (!site.coords) continue;
      const meters = haversineMeters(p.coords, site.coords);
      if (meters <= MERGE_RADIUS_M && (!best || meters < best.meters)) best = { site, meters };
    }
    if (best) {
      return { action: "merge", siteId: best.site._id, copy: false, reason: `within ${Math.round(best.meters)} m of this site` };
    }
  }

  const key = normalizeAddress(p.address);
  if (key) {
    const same = ctx.sites.find((s) => normalizeAddress(s.address) === key);
    if (same) return { action: "merge", siteId: same._id, copy: false, reason: `same address: ${same.address}` };
  }

  if (p.kind === "trapped" || p.kind === "missing") {
    return { action: "new", reason: p.coords || key ? "no open site nearby" : "no place given yet: a call must verify it" };
  }
  return { action: "reject", reason: `a "${p.kind}" report must match a site, and none matched` };
}
