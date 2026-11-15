// The agents' only window onto the desk. Two implementations:
//   fixture-desk.ts  fake data from fixtures/ and data/seed.json, events kept in memory (default)
//   http-desk.ts     Role 1's API: set DESK_API_URL=http://localhost:3000 (and AGENT_KEY)
// The agents never write records. They read context and post events, nothing else.

import type {
  Event, EventType, Incident, InboxItem, Message, Need, Road, Shelter, Site, Source, Task, User, Zone,
} from "@/lib/types";

/** Need plus who asked for it. `requestedBy` is asked of Role 1 in "Personal agents"; optional until then. */
export type NeedWithAsker = Need & { requestedBy?: string[] };

export interface Board {
  sites: Site[];
  needs: NeedWithAsker[];
  roads: Road[];
  shelters: Shelter[];
  zones: Zone[];
  incidents: Incident[];
  tasks: Task[];
}

/** What an agent sends. The server adds _id, ts, status and lane. */
export interface NewEvent<P = unknown> {
  deskId: string;
  type: EventType;
  source: Source;
  actor: string;            // the person's user id, or an agent name for workers
  payload: P;
  observedAt?: string;      // ISO time when it was true
  dedupeKey?: string;
}

export interface UserContext {
  user: User;
  now: Date;
  inbox: InboxItem[];                 // unread items for this person
  tasks: Task[];                      // their open tasks, tier then priority
  approvals: Task[];                  // coordinators only: tasks waiting for approval
  stuck: Task[];                      // coordinators only: open tasks nobody took (escalated)
  myNeeds: NeedWithAsker[];           // needs this person filed
  myIncidents: Incident[];            // open incidents this person reported
  openIncidents: Incident[];          // coordinators only: every open incident, most severe first
  records: { sites: Site[]; needs: Need[]; roads: Road[]; shelters: Shelter[] }; // touched by their tasks
  messages: Message[];                // recent chat lines word for word, oldest first
  chatSummary?: string;               // older chat lines, summarized (MongoDB desk only)
  postedThisSession: Event[];         // events this person's agent already filed, newest first
}

export interface DeskPort {
  readonly name: string;
  getUser(userId: string): Promise<User | undefined>;
  listUsers(): Promise<User[]>;
  getBoard(deskId: string): Promise<Board>;
  getUserContext(userId: string): Promise<UserContext>;
  recentEvents(deskId: string, sinceMinutes: number): Promise<Event[]>;
  postEvent(e: NewEvent): Promise<string>;
  saveMessage(m: Omit<Message, "_id">): Promise<void>;
  close?(): Promise<void>;           // workers call it at the end so the process can exit
}

export const byPriority = (a: { tier: number; priority: number }, b: { tier: number; priority: number }) =>
  a.tier - b.tier || b.priority - a.priority;

/** Builds a UserContext from a board, an inbox and a message log. Shared by both desks. */
export function composeContext(args: {
  user: User; board: Board; inbox: InboxItem[]; messages: Message[]; posted: Event[]; now: Date;
}): UserContext {
  const { user, board, inbox, messages, posted, now } = args;
  const tasks = board.tasks.filter((t) => t.open && t.assignee === user._id).sort(byPriority);
  const approvals = user.role === "coordinator"
    ? board.tasks.filter((t) => t.status === "waiting_approval").sort(byPriority)
    : [];
  const stuck = user.role === "coordinator"
    ? board.tasks.filter((t) => t.open && t.status === "escalated").sort(byPriority)
    : [];
  const touched = new Set(tasks.map((t) => t.recordId));
  const myNeeds = board.needs
    .filter((n) => n.requestedBy?.includes(user._id) && n.status !== "cancelled")
    .sort(byPriority);
  const myIncidents = board.incidents.filter((i) => i.reportedBy === user._id && i.status !== "resolved");
  const sev = { critical: 0, high: 1, low: 2 } as const;
  const openIncidents = user.role === "coordinator"
    ? board.incidents.filter((i) => i.status !== "resolved").sort((a, b) => sev[a.severity] - sev[b.severity])
    : [];
  return {
    user, now,
    inbox: inbox.filter((i) => i.userId === user._id && i.status === "unread"),
    tasks, approvals, stuck, myNeeds, myIncidents, openIncidents,
    records: {
      sites: board.sites.filter((s) => touched.has(s._id)),
      needs: board.needs.filter((n) => touched.has(n._id)),
      roads: board.roads.filter((r) => r.state !== "open"),
      shelters: board.shelters,
    },
    messages: messages.filter((m) => m.userId === user._id).slice(-10),
    postedThisSession: posted.filter((e) => e.actor === user._id).slice(0, 10),
  };
}
