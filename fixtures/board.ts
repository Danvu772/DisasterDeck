// Fake board for building screens before /api/board exists. Times are relative to `now`
// so ages and stale flags look real. Holds the ugly cases on purpose.
// Every name, address and number here is made up.
import type { Incident, Need, Road, Shelter, Site, Task } from "@/lib/types";

const DESK = "malatya-2023";

export function makeBoard(now: number) {
  const ago = (min: number) => new Date(now - min * 60000);

  const sites: Site[] = [
    {
      _id: "site-57", address: "Örnek St. 12", region: "Battalgazi", coords: [38.355, 38.309],
      peopleTrapped: 1, callStatus: "not_called", status: "open",
      sources: [1, 2, 3, 4].map((i) => ({ source: "x" as const, eventId: `ev-${i}` })),
      history: [
        { ts: ago(14), by: "x-agent", source: "x", reason: "Opened from tweet: \"Annem enkaz altında, Örnek Sk. 12\" (My mother is under the rubble, Örnek St. 12)" },
        { ts: ago(9), by: "memory-keeper", source: "system", reason: "Merged 3 duplicate tweets" },
      ],
      deskId: DESK, confidence: "corroborated", observedAt: ago(14), tier: 0, priority: 54, support: 4,
    },
    {
      _id: "site-52", address: "Çınar St. 3", region: "Yeşilyurt", peopleTrapped: 3,
      callStatus: "verified", status: "team_on_site",
      sources: [{ source: "person", eventId: "ev-9" }],
      history: [{ ts: ago(40), by: "Zeynep", source: "person", reason: "Called back, voices heard" }],
      deskId: DESK, confidence: "confirmed", observedAt: ago(40), tier: 0, priority: 70, support: 1,
    },
    {
      _id: "site-61", address: "near the mosque, Kale", region: "Kale", peopleTrapped: 0,
      callStatus: "not_called", status: "open", sources: [{ source: "x", eventId: "ev-20" }],
      history: [], deskId: DESK, confidence: "unconfirmed", observedAt: ago(95), tier: 1, priority: 31, support: 1,
    },
  ];

  const needs: Need[] = [
    {
      _id: "need-1", item: "blankets", quantity: 20, region: "Battalgazi", siteIds: ["site-52"],
      status: "on_the_way", history: [], deskId: DESK, confidence: "confirmed", lifeThreatening: true,
      lines: [{ siteId: "site-52", quantity: 20 }], tier: 0, priority: 62, support: 1,
    },
    {
      _id: "need-2", item: "hot meals", quantity: 40, region: "Yeşilyurt", siteIds: [],
      status: "proposed", history: [], deskId: DESK, confidence: "unconfirmed", lifeThreatening: false,
      lines: [{ quantity: 40 }], tier: 2, priority: 12, support: 1,
    },
  ];

  const shelters: Shelter[] = [
    { _id: "sh-a", name: "Shelter A, school gym", region: "Battalgazi", bedsUsed: 58, bedsTotal: 60,
      updated: ago(3), observedAt: ago(120), history: [], deskId: DESK },
    { _id: "sh-b", name: "Shelter B, mosque hall", region: "Yeşilyurt", bedsUsed: 24, bedsTotal: 60,
      updated: ago(5), observedAt: ago(5), history: [], deskId: DESK },
  ];

  const roads: Road[] = [
    { _id: "rd-1", road: "İnönü Ave, north", state: "closed", reason: "Collapsed building on the road",
      history: [], deskId: DESK, confidence: "confirmed", observedAt: ago(22) },
    { _id: "rd-2", road: "Ring road exit 3", state: "unconfirmed", reason: "One tweet says traffic is stuck",
      history: [], deskId: DESK, confidence: "unconfirmed", observedAt: ago(48) },
  ];

  const incidents: Incident[] = [
    {
      _id: "inc-1", deskId: DESK, kind: "vehicle_breakdown", reportedBy: "supplier-2", taskId: "task-3",
      severity: "critical", canContinue: false,
      text: "Lastik patladı, 14. km'deyim", textEn: "Flat tire, I'm stuck at km 14, 30 blankets on board",
      status: "helping",
      actions: [
        { ts: ago(2), what: "Blocked the delivery, need back to open" },
        { ts: ago(2), what: "Relay task to supplier-4 (6 km away)", taskId: "task-4" },
        { ts: ago(1), what: "Told field team 4: new ETA 45 min" },
      ],
      history: [],
    },
  ];

  const tasks: Task[] = [
    {
      _id: "task-1", type: "call", recordType: "site", recordId: "site-57", assignee: "Zeynep",
      tried: [], risk: "low", tier: 0, priority: 54, status: "assigned", open: true,
      title: "Call about Örnek St. 12", detail: "4 people posted about her, nobody has called yet. Phone •••• •• 42",
      deadline: new Date(now + 5 * 60000),
      history: [{ ts: ago(6), by: "dispatcher", source: "system", reason: "Nearest free volunteer" }], deskId: DESK,
    },
    {
      _id: "task-2", type: "rescue", recordType: "site", recordId: "site-61",
      tried: ["team-2"], risk: "high", tier: 0, priority: 48, status: "waiting_approval", open: true,
      title: "Send Army Team 4 to Kale", detail: "600 m away, free. Needs coordinator approval.",
      deadline: ago(3),
      history: [{ ts: ago(18), by: "dispatcher", source: "system", reason: "Team 2 declined, next nearest is Team 4" }],
      deskId: DESK,
    },
  ];

  return { sites, needs, shelters, roads, incidents, tasks, health: { pending: 3, oldestPendingSeconds: 2 } };
}
