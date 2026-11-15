// Pure adapter for /demo: board + feed in, the six story steps out. No React, no fetch.
// One site carries the story: the one whose first steps are done in a row, so a half-finished
// case wins over an old closed one that never had a post from X.
import type { Event, Incident, Site, Task } from "@/lib/types";

export type StoryBoard = { sites: Site[]; tasks: Task[]; incidents: Incident[] };
export type StoryEvent = Pick<Event, "type" | "ts" | "result" | "payload">;

export interface Step {
  id: string;
  title: string;        // what the pitch says happens
  done: boolean;
  at?: Date;            // when it happened, when known
  label?: string;       // the record it is about: "Site 57" or the address
  openKey?: string;     // "<kind>:<id>" for /?open=
}

const TITLES = [
  "A post arrives",
  "A volunteer is asked to call",
  "The call confirms it",
  "The coordinator approves a team",
  "The team arrives",
  "Problem solved",
];

const asDate = (d: Date | string | undefined) => (d ? new Date(d) : undefined);
const latest = (xs: (Date | undefined)[]) =>
  xs.reduce<Date | undefined>((a, b) => (b && (!a || +b > +a) ? b : a), undefined);
const earliest = (xs: (Date | undefined)[]) =>
  xs.reduce<Date | undefined>((a, b) => (b && (!a || +b < +a) ? b : a), undefined);

// When events say something touched these ids, their stamps. Empty when the feed does not know.
function eventTimes(events: StoryEvent[], ids: string[], type?: Event["type"], progress?: string) {
  return events
    .filter((e) => (!type || e.type === type)
      && (e.result?.recordIds ?? []).some((r) => ids.includes(r))
      && (!progress || (e.payload as { progress?: string } | null)?.progress === progress))
    .map((e) => new Date(e.ts));
}

function stepsFor(site: Site, board: StoryBoard, events: StoryEvent[]): Step[] {
  const label = site.caseNo ? `Site ${site.caseNo}` : site.address;
  const openKey = `site:${site._id}`;
  const mine = board.tasks.filter((t) => t.recordType === "site" && t.recordId === site._id);
  const call = mine.find((t) => t.type === "call" && t.assignee && t.status !== "cancelled");
  // Once approved, a rescue task is assigned, accepted or later done. waiting_approval is the step before.
  const rescue = mine.find((t) => t.type === "rescue" && ["assigned", "accepted", "done"].includes(t.status));
  const rescueIds = mine.filter((t) => t.type === "rescue").map((t) => t._id);
  const incident = board.incidents.find((i) =>
    i.status === "resolved" && (i.taskId ? mine.some((t) => t._id === i.taskId) : false));

  const histAt = (h: { ts: Date | string }[] | undefined, pick: "first" | "last") =>
    asDate(h?.length ? (pick === "first" ? h[0] : h[h.length - 1]).ts : undefined);
  const siteIds = [site._id];

  const posted = site.sources.some((s) => s.source === "x");
  const arrived = site.status === "team_on_site" || site.status === "closed"
    || mine.some((t) => t.type === "rescue" && t.progress === "arrived");
  const closed = site.status === "closed" || !!incident;

  const raw: Omit<Step, "id" | "title">[] = [
    { done: posted, at: earliest(eventTimes(events, siteIds, "report")) ?? histAt(site.history, "first") ?? asDate(site.observedAt), label, openKey },
    { done: !!call, at: asDate(call && histAt(call.history, "first")), label, openKey },
    { done: site.callStatus === "verified",
      at: latest(eventTimes(events, siteIds, "answer")) ?? histAt(site.history, "last"), label, openKey },
    { done: !!rescue,
      at: latest(eventTimes(events, rescueIds, "approval")) ?? (rescue && histAt(rescue.history, "last")), label, openKey },
    { done: arrived,
      at: latest(eventTimes(events, rescueIds, "answer", "arrived")) ?? histAt(site.history, "last"), label, openKey },
    { done: closed,
      at: incident ? histAt(incident.history, "last") : histAt(site.history, "last"),
      label: incident?.caseNo ? `Incident ${incident.caseNo}` : label,
      openKey: incident ? `incident:${incident._id}` : openKey },
  ];
  return raw.map((s, i) => ({ id: `step-${i + 1}`, title: TITLES[i], ...s, at: s.done ? s.at : undefined }));
}

const run = (steps: Step[]) => steps.findIndex((s) => !s.done) === -1 ? steps.length : steps.findIndex((s) => !s.done);

// The six steps for the site furthest along. With no sites, six waiting steps.
export function storySteps(board: StoryBoard, events: StoryEvent[]): Step[] {
  const options = board.sites.filter((s) => s.status !== "retracted").map((s) => stepsFor(s, board, events));
  if (!options.length) return TITLES.map((title, i) => ({ id: `step-${i + 1}`, title, done: false }));
  const total = (st: Step[]) => st.filter((s) => s.done).length;
  return options.sort((a, b) => run(b) - run(a) || total(b) - total(a))[0];
}

// The newest completed step: the furthest one that is done.
export function newestDone(steps: Step[]): string | null {
  for (let i = steps.length - 1; i >= 0; i--) if (steps[i].done) return steps[i].id;
  return null;
}

export interface Counts { sites: number; tasks: number; incidents: number }
export function storyCounts(board: StoryBoard): Counts {
  return {
    sites: board.sites.filter((s) => s.status === "open" || s.status === "team_on_site").length,
    tasks: board.tasks.filter((t) => t.open).length,
    incidents: board.incidents.filter((i) => i.status !== "resolved").length,
  };
}
