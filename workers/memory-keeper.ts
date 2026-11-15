// Owned by Role 1. The memory keeper: the only writer of records (sites, needs, roads,
// shelters, zones, incidents). The Brain loop (workers/brain.ts) calls apply() with one event
// at a time. apply() writes, and returns what changed for the dispatcher.
//
// apply() is safe to run twice on the same event (a crash between writing a record and marking
// the event): a site never gets the same source twice, and a new site's id comes from the event.
import { MongoServerError } from "mongodb";
import { cols } from "../lib/db";
import { normalizeText } from "../lib/geo";
import { decideReport, type SiteLite } from "../lib/rules/merge";
import { confidence, score, siteTier, support, type Voice } from "../lib/rules/priority";
import { reportPayload } from "../lib/schemas";
import type { Event, EventType, HistoryEntry, RecordType, ReportPayload, Site, Trust } from "../lib/types";

/** Event types the keeper handles today. Others stay pending until their handler lands. */
export const HANDLED: EventType[] = ["report"];

/** One record the keeper created or changed: what the dispatcher reacts to. */
export interface Change {
  recordType: RecordType;
  recordId: string;
  op: "created" | "updated";
  eventId: string;
  fields: string[];
}

export interface KeeperResult {
  status: "done" | "merged" | "rejected";
  result: NonNullable<Event["result"]>;
  changes: Change[];
}

export async function apply(event: Event): Promise<KeeperResult> {
  switch (event.type) {
    case "report":
      return applyReport(event);
    default:
      // The Brain only takes HANDLED types, so this means a bug, not bad input.
      throw new Error(`memory keeper has no handler for "${event.type}"`);
  }
}

// ---------- reports → sites ----------

const reject = (reason: string, textKey?: string): KeeperResult => ({
  status: "rejected", result: { recordIds: [], reason, ...(textKey ? { textKey } : {}) }, changes: [],
});

async function applyReport(event: Event): Promise<KeeperResult> {
  // Checked at the door already when it came over HTTP, but server code can call postEvent()
  // directly. Text from outside is data: if it does not fit the schema, it does not get in.
  const parsed = reportPayload.safeParse(event.payload);
  if (!parsed.success) return reject(`payload is not a valid report: ${parsed.error.issues[0]?.message}`);
  const p: ReportPayload = parsed.data;
  const eventId = event._id!;
  const textKey = normalizeText(p.text) ?? undefined;
  const c = await cols();

  const openSites = await c.sites
    .find({ deskId: event.deskId, status: { $ne: "retracted" } }, { projection: { _id: 1, address: 1, coords: 1 } })
    .toArray() as SiteLite[];
  const openIds = new Set(openSites.map((s) => s._id));

  // Rule 1: the same text was reported before → the site that report went to.
  let copyOfSiteId: string | undefined;
  if (textKey) {
    const earlier = await c.events.findOne(
      { deskId: event.deskId, "result.textKey": textKey, _id: { $ne: eventId }, status: { $in: ["done", "merged"] } },
      { projection: { result: 1 }, sort: { ts: 1 } },
    );
    copyOfSiteId = earlier?.result?.recordIds.find((id) => openIds.has(id));
  }

  const decision = decideReport(p, {
    sites: openSites, copyOfSiteId, siteExists: p.siteId ? openIds.has(p.siteId) : undefined,
  });
  if (decision.action === "reject") return reject(decision.reason, textKey);

  const now = new Date();
  const observedAt = event.observedAt ?? event.ts;
  const entry: HistoryEntry = {
    ts: now, by: event.actor, source: event.source,
    reason: `${p.kind}${p.peopleCount ? ` (${p.peopleCount} people)` : ""}: ${decision.reason}`,
  };
  const thisVoice = await voiceOf(event, textKey);

  if (decision.action === "new") {
    const people = p.kind === "trapped" ? (p.peopleCount ?? 1) : 0;
    const voices = [thisVoice];
    const site: Site = {
      _id: `site-${eventId}`,             // from the event, so a re-run cannot make a second site
      address: p.address ?? "address unknown",
      ...(p.coords ? { coords: p.coords } : {}),
      region: p.region ?? "unknown",
      peopleTrapped: people,
      callStatus: "not_called",
      status: "open",
      sources: [{ source: event.source, eventId }],
      history: [{ ...entry, reason: `opened from a ${p.kind} report: ${decision.reason}` }],
      deskId: event.deskId,
      confidence: confidence(voices),
      observedAt,
      tier: siteTier(people, [p.kind]),
      support: support(voices),
      priority: score({ support: support(voices), waitingSince: observedAt }, now),
    };
    try {
      await c.sites.insertOne(site);
    } catch (err) {
      if (!(err instanceof MongoServerError && err.code === 11000)) throw err; // already made on a run that crashed
    }
    return {
      status: "done",
      result: { recordIds: [site._id], reason: site.history[0].reason, ...(textKey ? { textKey } : {}) },
      changes: [{ recordType: "site", recordId: site._id, op: "created", eventId, fields: Object.keys(site) }],
    };
  }

  // Merge into an existing site.
  const site = await c.sites.findOne({ _id: decision.siteId });
  if (!site) return reject(`site ${decision.siteId} disappeared`, textKey);
  const result = { recordIds: [site._id], reason: entry.reason, ...(textKey ? { textKey } : {}) };
  if (site.sources.some((s) => s.eventId === eventId)) {
    return { status: "merged", result, changes: [] }; // this event was already applied
  }

  const voices = [...(await voicesOf(site.sources.map((s) => s.eventId))), thisVoice];
  let people = site.peopleTrapped;
  if (p.kind === "trapped" || p.kind === "missing") {
    // A repeat of a call says how many are trapped, it does not add more people.
    if (p.kind === "trapped" && p.peopleCount !== undefined) people = Math.max(people, p.peopleCount);
  } else if (p.kind === "rescued") {
    people = Math.max(0, people - (p.peopleCount ?? 1));
  }
  const firstSeen = observedAt < site.observedAt ? observedAt : site.observedAt;
  const sup = support(voices);
  const set: Partial<Site> = {
    peopleTrapped: people,
    confidence: confidence(voices),
    support: sup,
    tier: siteTier(people, []),
    observedAt: firstSeen,
    priority: score({ support: sup, waitingSince: firstSeen }, now),
  };
  // A later report can fill in what the first one did not know. It never overwrites.
  if (site.address === "address unknown" && p.address) set.address = p.address;
  if (!site.coords && p.coords) set.coords = p.coords;
  if (site.region === "unknown" && p.region) set.region = p.region;
  if (decision.copy) entry.reason = `copy of an earlier report (adds a source, not support)`;

  await c.sites.updateOne(
    { _id: site._id, "sources.eventId": { $ne: eventId } },
    { $set: set, $push: { sources: { source: event.source, eventId }, history: entry } },
  );
  const fields = Object.keys(set).filter((k) => JSON.stringify(set[k as keyof Site]) !== JSON.stringify(site[k as keyof Site]));
  return {
    status: "merged",
    result: { ...result, reason: entry.reason },
    changes: [{ recordType: "site", recordId: site._id, op: "updated", eventId, fields: [...fields, "sources", "history"] }],
  };
}

// ---------- who said it ----------

const SYSTEM_SOURCES = new Set(["system", "nasa"]);

/**
 * One voice per reporter. A person is themselves. A social post has no known author in our
 * data, so its voice is its text: copies of one text are one voice, different words are another.
 */
async function voiceOf(e: Pick<Event, "_id" | "source" | "actor">, textKey?: string): Promise<Voice> {
  if (e.source === "person") return { key: `person:${e.actor}`, trust: await trustOf(e.actor) };
  if (SYSTEM_SOURCES.has(e.source)) return { key: `${e.source}:${e.actor}`, trust: "official" };
  return { key: `${e.source}:${textKey ?? e._id}`, trust: "public" };
}

async function voicesOf(eventIds: string[]): Promise<Voice[]> {
  const { events } = await cols();
  const evs = await events
    .find({ _id: { $in: eventIds } }, { projection: { _id: 1, source: 1, actor: 1, result: 1 } })
    .toArray();
  return Promise.all(evs.map((e) => voiceOf(e, e.result?.textKey)));
}

const trustCache = new Map<string, { trust: Trust; at: number }>();
async function trustOf(userId: string): Promise<Trust> {
  const hit = trustCache.get(userId);
  if (hit && Date.now() - hit.at < 60_000) return hit.trust;
  const { users } = await cols();
  const user = await users.findOne({ _id: userId }, { projection: { trust: 1 } });
  const trust: Trust = user?.trust ?? "public";
  trustCache.set(userId, { trust, at: Date.now() });
  return trust;
}
