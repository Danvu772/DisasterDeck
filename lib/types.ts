// Owned by Role 1. Ask before changing.          Version 2.1, 14 Nov.
// Source of truth: docs/.../Roles/Team contracts.md §3.
// v2.1: Need.requestedBy (asked for in "Personal agents"), and the helper types at the
//       bottom for the functions in lib/db.ts. No existing field changed.
export type Role = "volunteer" | "field" | "supplier" | "shelter" | "coordinator"
                 | "public";                                              // v2: a citizen
export type Trust = "official" | "vetted" | "public";                     // v2
export type Confidence = "unconfirmed" | "corroborated" | "confirmed";    // v2
export type Source = "x" | "news" | "reddit" | "instagram" | "facebook"
                   | "sheet" | "nasa" | "person" | "system";
export type LatLng = [number, number];   // [lat, lng], the order Leaflet uses
export type Tier = 0 | 1 | 2;            // v2: 0 danger to life, 1 urgent, 2 comfort

export interface User {
  _id: string; name: string; role: Role; region: string;
  status: "available" | "busy" | "offline";
  deskId: string;                        // v2
  trust: Trust;                          // v2
  coords?: LatLng; lastSeen?: Date;      // v2: for "nearest" and "is this person there?"
  profile?: {                            // v2: the person's context file
    skills?: string[];                   //     "first_aid", "mechanic", "arabic"
    vehicle?: "none" | "car" | "van" | "truck";
    stock?: Record<string, number>;      //     suppliers: { blankets: 200 }
    notes?: string;                      //     what the agent should keep in mind
  };
}

export interface Message {               // v2: chat history, loaded by the personal agent
  _id: string; userId: string; from: "user" | "agent";
  text: string; ts: Date; eventIds?: string[];
}

export interface HistoryEntry { ts: Date; by: string; source: Source; reason: string; }

// ---------- Events: the only way anything enters memory ----------
export type EventType = "report" | "need" | "closure" | "capacity"
                      | "answer" | "approval" | "alert"
                      | "incident"       // v2: something went wrong (help desk)
                      | "claim"          // v2: "I am already doing this"
                      | "correction"     // v2: "the desk has this wrong"
                      | "plan";          // v2: evacuation plan, was missing here

export interface Event<P = unknown> {
  _id?: string;
  deskId: string;         // v2: which disaster, "malatya-2023" or "lahaina-2023"
  ts: Date;               // when the desk received it
  observedAt?: Date;      // v2: when it was true (tweet time, photo time). Default: ts
  type: EventType;
  source: Source;
  actor: string;          // user id or agent name. v2: SET BY THE SERVER, never by the client
  dedupeKey?: string;     // v2: e.g. "x:<tweet id>". Unique. The same key twice is ignored
  lane: 0 | 1;            // v2: set by postEvent(). 0 = a person on the desk or the sweeper,
                          //     1 = research agents and satellite
  payload: P;
  status: "pending" | "working" | "done" | "merged" | "rejected"
        | "failed";       // v2
  lockedAt?: Date; attempts?: number;   // v2: so a crashed keeper loses nothing
  result?: { recordIds: string[]; reason: string };
}

export interface ReportPayload {
  kind: "trapped" | "missing" | "rescued" | "site_update";
  text: string; textEn: string;
  address?: string; coords?: LatLng; region?: string;
  peopleCount?: number; phoneMasked?: string; siteId?: string;
}
export interface NeedPayload {
  item: string; quantity: number; lifeThreatening: boolean;
  siteId?: string; region?: string; coords?: LatLng;
}
export interface ClosurePayload {
  road: string; state: "closed" | "open" | "unconfirmed";
  reason: string; coords?: LatLng;
}
export interface CapacityPayload {
  shelter: string; bedsUsed: number; bedsTotal: number; photoUrl?: string;
}
export interface AnswerPayload {
  taskId: string; result: "accepted" | "declined" | "done";
  note?: string; etaMinutes?: number;
}
export interface ApprovalPayload { taskId: string; approved: boolean; }
export interface AlertPayload {
  zoneId: string; kind: "silent_zone" | "cold";                       // v2: cold
  evidence: { damage?: number; dark?: boolean; calls?: number; minTempC?: number };
}

// v2: the help desk
export type IncidentKind = "vehicle_breakdown" | "road_blocked" | "cannot_find"
                         | "short_supply" | "unsafe" | "injury"
                         | "handover" | "unreachable" | "other";
export interface IncidentPayload {
  incidentId?: string;      // set = an update to an open incident
  kind: IncidentKind;
  text: string; textEn: string;
  taskId?: string;          // the task that is in trouble, if any
  canContinue: boolean;     // can this person still finish the task?
  coords?: LatLng;
  canDeliver?: number;      // short_supply: how many they can still bring
  resolved?: boolean;       // update: the problem is over
}

// v2: "I am already taking water to the school"
export interface ClaimPayload {
  what: "call" | "rescue" | "deliver" | "assist";
  text: string; textEn: string;
  recordId?: string; etaMinutes?: number;
}

// v2: "these are two buildings", "that report is false"
export interface CorrectionPayload {
  action: "retract" | "edit" | "split" | "merge";
  recordType: RecordType; recordId: string;
  otherRecordId?: string;               // merge
  eventIds?: string[];                  // split: the sources that move out
  fields?: Record<string, unknown>;     // edit
  reason: string;
}

// v2: evacuation plan (Lahaina scene, only if time allows)
export interface PlanPayload {
  zoneExits: { zoneId: string; exit: string }[]; reason: string;
}

// ---------- Records: written only by the memory keeper ----------
export type RecordType = "site" | "need" | "road" | "shelter" | "zone" | "incident";

export interface Site {
  _id: string; address: string; coords?: LatLng; region: string;
  peopleTrapped: number;
  callStatus: "not_called" | "called" | "verified";
  status: "open" | "team_on_site" | "closed" | "retracted";           // v2: retracted
  sources: { source: Source; eventId: string }[];
  history: HistoryEntry[];
  deskId: string; confidence: Confidence; observedAt: Date;           // v2
  tier: Tier; priority: number; support: number;                      // v2
  hazard?: string;                                                    // v2: set by an unsafe incident
}
export interface Need {
  _id: string; item: string; quantity: number; region: string; siteIds: string[];
  status: "proposed"                                                  // v2: waits for more voices
        | "open" | "assigned" | "on_the_way" | "delivered"
        | "cancelled";                                                // v2
  history: HistoryEntry[];
  deskId: string; confidence: Confidence; lifeThreatening: boolean;   // v2
  lines: { siteId?: string; quantity: number }[];                     // v2: who gets how many
  tier: Tier; priority: number; support: number;                      // v2
  requestedBy: string[];                 // v2.1: user ids, one per different person who asked
}
export interface Road {
  _id: string; road: string; state: "open" | "closed" | "unconfirmed";
  reason: string; coords?: LatLng; history: HistoryEntry[];
  deskId: string; confidence: Confidence; observedAt: Date;           // v2
}
export interface Shelter {
  _id: string; name: string; region: string; coords?: LatLng;
  bedsUsed: number; bedsTotal: number; updated: Date; history: HistoryEntry[];
  deskId: string; observedAt: Date;      // v2: when the number was true, not when we got it
}
export interface Zone {
  _id: string; name: string; silentZone: boolean;
  damage: number; dark: boolean; calls: number;
  deskId: string; cold?: boolean; minTempC?: number;                  // v2
  exitAssigned?: string;                                              // v2: was in the design only
}
export interface Incident {                                           // v2
  _id: string; deskId: string; kind: IncidentKind;
  reportedBy: string;                    // user id, or "sweeper"
  taskId?: string; coords?: LatLng;
  severity: "low" | "high" | "critical";
  canContinue: boolean; text: string; textEn: string;
  status: "open" | "helping" | "escalated" | "resolved";
  actions: { ts: Date; what: string; taskId?: string }[];   // what the Brain did about it
  history: HistoryEntry[];
}

// ---------- Work: written only by the dispatcher ----------
export interface Task {
  _id: string;
  type: "call" | "rescue" | "deliver" | "notify"
      | "assist" | "evacuate";           // v2. "approve" is gone: see the note below
  recordType: RecordType;                // v2: which collection recordId points to
  recordId: string;
  assignee?: string;                     // v2: optional. Empty until someone is picked
  tried: string[];                       // v2: people who said no or did not answer
  risk: "low" | "high";
  tier: Tier; priority: number;          // v2
  status: "created" | "waiting_approval" | "assigned" | "accepted"
        | "blocked"                      // v2: an incident stopped it
        | "done" | "declined" | "timed_out" | "cancelled"
        | "escalated";                   // v2: nobody fits, a coordinator decides
  open: boolean;                         // v2: true while created, waiting_approval, assigned, accepted
                                         //     or escalated. False when blocked, done or cancelled.
                                         //     Unique index, see §4
  title: string; detail: string;
  deadline: Date;                        // answer by
  eta?: Date;                            // v2: promised finish, from the person's answer
  blockedBy?: string;                    // v2: incident id
  replaces?: string;                     // v2: the task this one took over from
  history: HistoryEntry[];
  deskId: string;                        // v2
}
export interface InboxItem {
  _id: string; userId: string; taskId?: string;
  message: string; status: "unread" | "read"; ts: Date;
  kind: "task" | "notice" | "approval" | "incident" | "checkin";      // v2: the UI needs it
  incidentId?: string; priority: number;                              // v2
}

// ---------- v2.1: helper types for lib/db.ts ----------

/** What a caller passes to postEvent(). The desk fills in _id, ts, lane and status. */
export interface NewEvent<P = unknown> {
  type: EventType;
  source: Source;
  actor: string;          // the API route sets it from the login, a worker passes its agent name
  payload: P;
  deskId?: string;        // default: process.env.DESK_ID
  observedAt?: Date;      // default: now
  dedupeKey?: string;     // e.g. "x:<tweet id>"
}

/** One snapshot of the queue, shown in one line at the bottom of the board. */
export interface Health {
  pending: number;
  oldestPendingSeconds: number;
  failed: number;
  lastLoopAt: Date | null; // stamped by the Brain loop
}

/** Everything the shared board shows. Each list is sorted by tier, then priority. */
export interface Board {
  sites: Site[]; needs: Need[]; roads: Road[]; shelters: Shelter[];
  zones: Zone[]; incidents: Incident[]; tasks: Task[];
  health: Health;
}

/** What a personal agent loads every turn. */
export interface UserContext {
  user: User | null;
  inbox: InboxItem[];      // unread, newest first
  tasks: Task[];           // their open tasks, by tier then priority
  records: (Site | Need | Road | Shelter | Zone | Incident)[]; // what those tasks point to
  needs: Need[];           // v2.1: needs this person asked for, not yet delivered or cancelled
  incidents: Incident[];   // their incidents that are not resolved
  messages: Message[];     // last 10, oldest first
}

export type SearchCollection = "sites" | "needs" | "roads" | "shelters" | "zones" | "incidents";

/** searchMemory(): read only, behind the personal agents' ask_desk tool. */
export interface SearchQuery {
  collection: SearchCollection;
  region?: string;
  status?: string;
  text?: string;           // case-insensitive, matched against names, addresses, items, roads
  limit?: number;          // default 20
  deskId?: string;         // default: process.env.DESK_ID
}
export interface SearchHit<R = Site | Need | Road | Shelter | Zone | Incident> {
  record: R;
  ageSeconds: number | null; // age of the fact (observedAt), null when unknown
}
