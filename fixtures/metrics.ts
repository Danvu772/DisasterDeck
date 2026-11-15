// Demo input for the metrics engine (t32). makeBoard() plus what the metrics need to have something
// to say: users with positions (coverage), timed tier-0 approvals (sla_t0), a delivered need
// (logistics), a far site nobody can reach (coverage), and a closure report behind one road
// (lifelines). Times are relative to `now`. Every name, address and number is made up.
import type { Event, Need, Site, Task, User } from "@/lib/types";
import type { MetricInput } from "@/components/metrics/registry";
import { makeBoard } from "./board";
import { makeCoordinatorTasks } from "./coordinator";
import { makeEvents, users as deskUsers } from "./desk";

const DESK = "antakya-2023";

// Positions for the desk's people, and one more free field team.
const COORDS: Record<string, [number, number]> = {
  "volunteer-callback": [36.196, 36.152],
  "field-alpha": [36.187, 36.144],
  "supplier-primary": [36.18, 36.169],
  "coordinator-duty": [36.192, 36.159],
};

export function makeMetricInput(now: number): MetricInput {
  const ago = (min: number) => new Date(now - min * 60000);
  const board = makeBoard(now);

  const users: User[] = [
    ...deskUsers.map((u) => ({ ...u, coords: COORDS[u._id] ?? u.coords, lastSeen: ago(3) })),
    {
      _id: "field-bravo", name: "Saha Ekibi B", role: "field", region: "antakya-merkez", status: "available",
      deskId: DESK, trust: "official", coords: [36.205, 36.165], lastSeen: ago(2),
      profile: { skills: ["rescue"], vehicle: "truck" },
    },
  ];

  const far: Site = {
    _id: "site-66", address: "Fırat St. 8, Battalgazi", region: "battalgazi", coords: [36.264, 36.212],
    peopleTrapped: 2, callStatus: "called", status: "open",
    sources: [{ source: "news", eventId: "ev-40" }, { source: "x", eventId: "ev-41" }],
    history: [{ ts: ago(30), by: "news-agent", source: "news", reason: "Local news: two people under a collapsed house" }],
    deskId: DESK, confidence: "corroborated", observedAt: ago(30), tier: 0, priority: 60, support: 2,
  };

  const water: Need = {
    _id: "need-6", item: "drinking water", quantity: 120, region: "antakya-merkez", siteIds: ["site-52"],
    status: "delivered", deskId: DESK, confidence: "confirmed", lifeThreatening: false,
    lines: [{ siteId: "site-52", quantity: 120 }], tier: 1, priority: 30, support: 2, requestedBy: ["field-alpha", "volunteer-callback"],
    history: [
      { ts: ago(110), by: "Saha Ekibi A", source: "person", reason: "120 bottles of water for the site and the families" },
      { ts: ago(104), by: "dispatcher", source: "system", reason: "Demo Depo A is bringing them" },
      { ts: ago(72), by: "Demo Depo A", source: "person", reason: "Delivered 120 bottles" },
    ],
  };
  const lateFuel: Need = {
    _id: "need-7", item: "generator fuel", quantity: 20, region: "antakya-merkez", siteIds: ["site-52"],
    status: "open", deskId: DESK, confidence: "confirmed", lifeThreatening: false,
    lines: [{ siteId: "site-52", quantity: 20 }], tier: 1, priority: 26, support: 1, requestedBy: ["field-alpha"],
    history: [{ ts: ago(85), by: "Saha Ekibi A", source: "person", reason: "Floodlight generator needs 20 l of fuel" }],
  };

  // Two tier-0 rescues that went through approval, so the percentiles have something to rank.
  const approved = (id: string, title: string, asked: number, took: number): Task => ({
    _id: id, type: "rescue", recordType: "site", recordId: "site-52", assignee: "field-alpha",
    tried: [], risk: "high", tier: 0, priority: 65, status: "done", open: false,
    title, detail: "Made up for the metrics demo.", deadline: ago(asked - 10),
    history: [
      { ts: ago(asked), by: "dispatcher", source: "system", reason: "Rescue is high risk, asked for coordinator approval" },
      { ts: ago(asked - took), by: "Demo Nöbetçi Koordinatör", source: "person", reason: "Approved dispatch" },
      { ts: ago(asked - took - 20), by: "Saha Ekibi A", source: "person", reason: "Done, two people out" },
    ],
    deskId: DESK,
  });

  const events: Event[] = [
    ...makeEvents(now),
    { _id: "ev-42", deskId: DESK, ts: ago(22), observedAt: ago(24), type: "closure", source: "person", actor: "field-alpha",
      lane: 0, status: "done", payload: { road: "İnönü Ave, north", state: "closed", reason: "Collapsed building on the road" },
      result: { recordIds: ["rd-1"], reason: "Road closed, confirmed by a field team" } },
    { _id: "ev-43", deskId: DESK, ts: ago(30), type: "closure", source: "x", actor: "x-agent",
      lane: 1, status: "merged", payload: { road: "İnönü Ave, north", state: "closed", reason: "Photo of rubble across the road" },
      result: { recordIds: ["rd-1"], reason: "Merged into road rd-1" } },
  ];

  return {
    board: {
      ...board,
      sites: [...board.sites, far],
      needs: [...board.needs, water, lateFuel],
      tasks: [...board.tasks, ...makeCoordinatorTasks(now),
        approved("task-12", "Rescue at Çınar St. 3, first floor", 95, 3),
        approved("task-13", "Rescue at Çınar St. 3, back room", 70, 9)],
    },
    events,
    users,
    now,
  };
}
