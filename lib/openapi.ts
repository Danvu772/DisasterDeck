// Owned by Role 1. The OpenAPI 3.1 description of our HTTP API, served at /api/openapi.json and
// shown by Swagger UI at /api/docs.
//
// Next.js cannot discover route bodies by itself, so this file is the registry. The event body
// is generated from the zod schemas in lib/schemas.ts, so it never drifts from what the route
// accepts. `npm run api:check` fails if a route file in app/api has no entry here, or the other
// way round. When you add a route: add it to `paths` below (or to UNDOCUMENTED).
import { z } from "zod";
import { eventBody } from "./schemas";

/** Route prefixes that are on purpose not in the spec. */
export const UNDOCUMENTED = [
  "/api/auth/",  // Auth.js sign-in, callback and session endpoints (Role 3), not ours to describe
  "/api/docs",   // the Swagger UI page itself
];

// zod → JSON Schema (draft 2020-12, the dialect OpenAPI 3.1 uses). A date can arrive as an
// ISO string over HTTP, so describe it that way.
function jsonSchema(schema: z.ZodType) {
  const out = z.toJSONSchema(schema, {
    io: "input",
    unrepresentable: "any",
    override: (ctx) => {
      if (ctx.zodSchema._zod.def.type === "date") {
        ctx.jsonSchema.type = "string";
        ctx.jsonSchema.format = "date-time";
      }
    },
  }) as Record<string, unknown>;
  delete out.$schema;
  return out;
}

const deskParam = {
  name: "desk", in: "query", required: false,
  description: "Which disaster. Default: the server's DESK_ID (antakya-2023)",
  schema: { type: "string" },
};

// Records are documented loosely: their exact fields are in lib/types.ts.
const recordList = (what: string) => ({
  type: "array", description: `${what}. Fields: see lib/types.ts`,
  items: { type: "object", required: ["_id", "deskId"], additionalProperties: true },
});

const errorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
});

export function buildSpec() {
  return {
    openapi: "3.1.0",
    info: {
      title: "Multiplayer Disaster Desk API",
      version: "2.1",
      description: [
        "Every fact enters the desk as an **event**. The Brain reads events one at a time and",
        "is the only writer of records, tasks and inboxes.",
        "",
        "**How to try it here:** click **Authorize** and either paste the `x-agent-key` (acts as a",
        "worker) or, with `DEMO_MODE=1`, type a seeded user id such as `coordinator-duty`,",
        "`field-alpha` or `volunteer-callback` into `user`. If you are signed in with SSOJet in",
        "this browser, your session cookie is sent automatically.",
      ].join("\n"),
    },
    servers: [{ url: "/" }],
    tags: [
      { name: "events", description: "The way into memory, and the feed of what came in (Role 1)" },
      { name: "desk", description: "Reading the shared memory (Role 1)" },
      { name: "agents", description: "Talking to your personal agent (Role 2)" },
      { name: "meta", description: "This documentation" },
    ],
    components: {
      securitySchemes: {
        agentKey: {
          type: "apiKey", in: "header", name: "x-agent-key",
          description: "Workers and the scenario player. The shared AGENT_KEY from Role 1.",
        },
        demoUser: {
          type: "apiKey", in: "query", name: "user",
          description: "Only when the server runs with DEMO_MODE=1: act as this seeded user id.",
        },
        session: {
          type: "apiKey", in: "cookie", name: "authjs.session-token",
          description: "SSOJet login through Auth.js. Sent by the browser after signing in at /login.",
        },
      },
      schemas: {
        EventBody: jsonSchema(eventBody),
        Event: {
          type: "object",
          description: "A stored event: the posted body plus what the desk added. Fields: `Event` in lib/types.ts",
          required: ["_id", "deskId", "ts", "type", "source", "actor", "lane", "payload", "status"],
          additionalProperties: true,
          properties: {
            _id: { type: "string" }, deskId: { type: "string" },
            ts: { type: "string", format: "date-time" }, observedAt: { type: "string", format: "date-time" },
            type: { type: "string" }, source: { type: "string" }, actor: { type: "string" },
            lane: { type: "integer", enum: [0, 1] }, payload: { type: "object" },
            status: { type: "string", enum: ["pending", "working", "done", "merged", "rejected", "failed"] },
            result: {
              type: "object",
              properties: { recordIds: { type: "array", items: { type: "string" } }, reason: { type: "string" } },
            },
          },
        },
        Health: {
          type: "object", required: ["pending", "oldestPendingSeconds", "failed", "lastLoopAt"],
          properties: {
            pending: { type: "integer" }, oldestPendingSeconds: { type: "integer" }, failed: { type: "integer" },
            lastLoopAt: { type: ["string", "null"], format: "date-time" },
          },
        },
        Board: {
          type: "object",
          required: ["sites", "needs", "roads", "shelters", "zones", "incidents", "tasks", "health"],
          properties: {
            sites: recordList("Collapse sites, by tier then priority"),
            needs: recordList("Needs, by tier then priority"),
            roads: recordList("Roads, newest first"),
            shelters: recordList("Shelters, by name"),
            zones: recordList("Zones, by name"),
            incidents: recordList("Problems on the ground, newest first"),
            tasks: recordList("Tasks, by tier then priority"),
            health: { $ref: "#/components/schemas/Health" },
          },
        },
        InboxItem: {
          type: "object", description: "One line in a person's inbox. Fields: `InboxItem` in lib/types.ts",
          required: ["_id", "userId", "message", "status", "ts", "kind", "priority"],
          properties: {
            _id: { type: "string" }, userId: { type: "string" }, message: { type: "string" },
            status: { type: "string", enum: ["unread", "read"] }, ts: { type: "string", format: "date-time" },
            kind: { type: "string", enum: ["task", "notice", "approval", "incident", "checkin"] },
            priority: { type: "number" }, taskId: { type: "string" }, incidentId: { type: "string" },
          },
        },
        Person: {
          type: "object", description: "A desk user without `profile` (stock counts and notes stay on the server)",
          required: ["_id", "name", "role", "region", "status"],
          properties: {
            _id: { type: "string" }, name: { type: "string" },
            role: { type: "string", enum: ["volunteer", "field", "supplier", "shelter", "coordinator", "public"] },
            region: { type: "string" }, status: { type: "string", enum: ["available", "busy", "offline"] },
            coords: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2, description: "[lat, lng]" },
            lastSeen: { type: "string", format: "date-time", description: "Last time this person's screen read their inbox" },
          },
        },
        Id: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
        Error: {
          type: "object", required: ["error"],
          properties: {
            error: { type: "string" },
            issues: {
              type: "array",
              items: {
                type: "object",
                properties: { path: { type: "string" }, message: { type: "string" } },
              },
            },
          },
        },
        ChatRequest: {
          type: "object",
          properties: {
            text: { type: "string", maxLength: 4000, description: "What the person said or typed" },
            imageBase64: { type: "string", description: "A photo: JPEG, PNG, WebP or GIF, at most ~3.5 MB" },
            audioBase64: { type: "string", description: "Not transcribed yet: the browser sends speech as text" },
            coords: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2, description: "[lat, lng]" },
            userId: { type: "string", description: "Demo fallback for ?user=, only with DEMO_MODE=1" },
          },
        },
        ChatResponse: {
          type: "object", required: ["reply", "eventIds", "actions"],
          properties: {
            reply: { type: "string", description: "What the agent says back, in plain words" },
            eventIds: { type: "array", items: { type: "string" }, description: "Events this turn posted" },
            actions: {
              type: "array",
              items: {
                type: "object",
                properties: { tool: { type: "string" }, summary: { type: "string" }, ok: { type: "boolean" } },
              },
            },
            model: { type: "string" },
          },
        },
      },
    },
    paths: {
      "/api/board": {
        get: {
          tags: ["desk"],
          summary: "Everything the shared board shows",
          description: [
            "Sites, needs, roads, shelters, zones, incidents and tasks of one desk, each sorted by tier",
            "(0 = danger to life first) then priority, plus queue `health`. Same shape as",
            "`fixtures/board.ts`. Screens poll it every second.",
            "",
            "Open to everyone when the server runs with `DEMO_MODE=1`; otherwise any signed-in person",
            "or agent.",
          ].join("\n"),
          security: [{}, { agentKey: [] }, { session: [] }, { demoUser: [] }],
          parameters: [deskParam],
          responses: {
            200: {
              description: "The board",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Board" } } },
            },
            401: errorResponse("Not signed in (only when DEMO_MODE is off)"),
          },
        },
      },
      "/api/health": {
        get: {
          tags: ["desk"],
          summary: "Is the Brain running?",
          description: "Counts only, open to everyone. A growing `pending` with an old `lastLoopAt` means the Brain loop (`npm run brain`) is not running.",
          security: [],
          responses: {
            200: {
              description: "Queue health",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Health" } } },
            },
          },
        },
      },
      "/api/inbox": {
        get: {
          tags: ["desk"],
          summary: "Your unread inbox",
          description: [
            "The caller's unread items, newest first, at most 100. Each call stamps the caller's",
            "`lastSeen`, so a screen that polls the inbox also says the person is there.",
            "An inbox belongs to a person: the agent key gets 400.",
          ].join("\n"),
          security: [{ session: [] }, { demoUser: [] }],
          responses: {
            200: {
              description: "Unread items, newest first",
              content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/InboxItem" } } } },
            },
            400: errorResponse("Called with the agent key"),
            401: errorResponse("Not signed in, or unknown demo user"),
          },
        },
        post: {
          tags: ["desk"],
          summary: "Mark inbox items read",
          description: "Marks the listed `ids` read, or every unread item when `ids` is missing or the body is empty. Only the caller's own items change.",
          security: [{ session: [] }, { demoUser: [] }],
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: { type: "object", properties: { ids: { type: "array", items: { type: "string" }, maxItems: 500 } } },
                examples: { some: { summary: "Two items", value: { ids: ["6740a1...", "6740a2..."] } }, all: { summary: "Everything", value: {} } },
              },
            },
          },
          responses: {
            200: {
              description: "How many items changed from unread to read",
              content: { "application/json": { schema: { type: "object", required: ["read"], properties: { read: { type: "integer" } } } } },
            },
            400: errorResponse("Body is not JSON, ids is not a list of strings, or called with the agent key"),
            401: errorResponse("Not signed in, or unknown demo user"),
          },
        },
      },
      "/api/users": {
        get: {
          tags: ["desk"],
          summary: "The people on this desk",
          description: [
            "`_id`, `name`, `role`, `region`, `status`, `coords` and `lastSeen` of every user on the desk,",
            "by name. Never `profile`. Citizens (role `public`) get 403. Every other role and the agent key",
            "may read it.",
          ].join("\n"),
          security: [{ agentKey: [] }, { session: [] }, { demoUser: [] }],
          parameters: [deskParam],
          responses: {
            200: {
              description: "People, by name",
              content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Person" } } } },
            },
            401: errorResponse("Not signed in, unknown demo user, or wrong x-agent-key"),
            403: errorResponse("Citizens do not see the people list"),
          },
        },
      },
      "/api/events": {
        get: {
          tags: ["events"],
          summary: "The desk feed: events after a time",
          description: [
            "Events this desk received after `since`, oldest first, with their `status` and `result`",
            "(which record they went to, and why). Keep the `ts` of the last event you got and pass it",
            "as `since` next time. Without `since`: the latest `limit` events, still oldest first.",
            "Phone numbers anywhere in a payload are masked on the way out (`•••••••••42`).",
            "",
            "Open to everyone when the server runs with `DEMO_MODE=1`; otherwise any signed-in person",
            "or agent.",
          ].join("\n"),
          security: [{}, { agentKey: [] }, { session: [] }, { demoUser: [] }],
          parameters: [
            {
              name: "since", in: "query", required: false,
              description: "ISO time (`2026-11-14T22:00:00Z`) or epoch milliseconds",
              schema: { type: "string" }, example: "2026-11-14T22:00:00Z",
            },
            {
              name: "limit", in: "query", required: false,
              description: "How many events at most (1–500, default 50)",
              schema: { type: "integer", minimum: 1, maximum: 500, default: 50 },
            },
            deskParam,
          ],
          responses: {
            200: {
              description: "Events, oldest first",
              content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Event" } } } },
            },
            400: errorResponse("since or limit is not valid"),
            401: errorResponse("Not signed in (only when DEMO_MODE is off)"),
          },
        },
        post: {
          tags: ["events"],
          summary: "Post an event into the queue",
          description: [
            "The server sets `actor`, `ts`, `lane` and `status`; unknown fields in the body are dropped.",
            "Posting the same `dedupeKey` again returns the first event's id, so retries are safe.",
            "",
            "**Who is calling** (checked in this order):",
            "1. `x-agent-key` header: a worker or the scenario player. It may name itself with `actor`",
            "   (default `<source>-agent`, e.g. `nasa-agent`).",
            "2. The SSOJet login session (Auth.js cookie). The person is always the actor; an `actor`",
            "   in their body is ignored.",
            "3. `?user=<seeded user id>`, only when the server runs with `DEMO_MODE=1`.",
            "",
            "Server code (workers, `/api/chat`) can call `postEvent()` from `lib/db.ts` directly instead.",
            "",
            "**Rules (about the actor, however the request arrived):**",
            "- a person posts with `source: \"person\"` only",
            "- a person cannot post a `need` (needs go through `/api/chat`), an `alert` or a `plan`",
            "- `approval`, `answer`, `correction` need `source: \"person\"`: a social post never approves",
            "- `approval` only from a coordinator; `answer` only from the task's assignee",
            "- an `incident` about a task, from a person: only its assignee or a coordinator",
            "",
            "Task state (is it still waiting for approval?) is decided later by the Brain loop.",
          ].join("\n"),
          security: [{ agentKey: [] }, { session: [] }, { demoUser: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/EventBody" },
                examples: {
                  alert: {
                    summary: "Satellite watcher: cold night (agent key)",
                    value: {
                      type: "alert", source: "nasa", observedAt: "2023-02-09T23:59:59Z",
                      dedupeKey: "nasa:antakya-2023:antakya-mor:cold:demo",
                      payload: { zoneId: "antakya-mor", kind: "cold", evidence: { minTempC: -14.4 } },
                    },
                  },
                  report: {
                    summary: "X agent: someone trapped (agent key)",
                    value: {
                      type: "report", source: "x", actor: "x-agent", dedupeKey: "x:1622870000000000000",
                      observedAt: "2023-02-06T04:30:00Z",
                      payload: {
                        kind: "trapped", text: "Annem enkaz altında, Örnek Sk. 12",
                        textEn: "My mother is under the rubble, Örnek St. 12", address: "Örnek Sk. 12",
                        peopleCount: 1,
                      },
                    },
                  },
                  answer: {
                    summary: "Task button: the assignee accepts (user = the assignee)",
                    value: { type: "answer", source: "person", payload: { taskId: "<task id>", result: "accepted", etaMinutes: 30 } },
                  },
                  approval: {
                    summary: "Coordinator approves a dispatch (user = coordinator-duty)",
                    value: { type: "approval", source: "person", payload: { taskId: "<task id>", approved: true } },
                  },
                  incident: {
                    summary: "Problem button: flat tire (user = the assignee)",
                    value: {
                      type: "incident", source: "person",
                      payload: {
                        kind: "vehicle_breakdown", text: "Flat tire at km 14", textEn: "Flat tire at km 14",
                        taskId: "<task id>", canContinue: false,
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Queued (or already queued with this dedupeKey)",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Id" } } },
            },
            400: errorResponse("Not JSON, or the event does not match its schema (see `issues`)"),
            401: errorResponse("Not signed in, unknown demo user, or wrong x-agent-key"),
            403: errorResponse("This actor may not post this event"),
            404: errorResponse("The task named in the payload does not exist"),
            500: errorResponse("Server error. Safe to retry with the same dedupeKey"),
          },
        },
      },
      "/api/chat": {
        post: {
          tags: ["agents"],
          summary: "One turn with the person's own agent",
          description: [
            "Owned by Role 2. The agent reads the person's context from memory, answers in plain words,",
            "and posts any events (reports, needs, answers, problems) itself. Rate limited per person:",
            "8 messages a minute, 80 an hour. Only for people: no agent key.",
          ].join("\n"),
          security: [{ session: [] }, { demoUser: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ChatRequest" },
                examples: {
                  blankets: {
                    summary: "Field team asks for blankets (user = field-alpha)",
                    value: { text: "We need 20 blankets, one person has hypothermia" },
                  },
                  question: {
                    summary: "Volunteer asks the desk (user = volunteer-callback)",
                    value: { text: "Which shelters have space?" },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "The agent's reply and what it filed",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ChatResponse" } } },
            },
            400: errorResponse("Body is not JSON, or a field has the wrong type"),
            401: errorResponse("Who is talking? Sign in, or ?user= with DEMO_MODE=1"),
            404: errorResponse("Unknown user"),
            413: errorResponse("Photo too large"),
            415: errorResponse("Photo is not JPEG, PNG, WebP or GIF"),
            429: errorResponse("Too many messages, wait a minute"),
            502: errorResponse("The agent failed this turn, try again"),
          },
        },
      },
      "/api/openapi.json": {
        get: {
          tags: ["meta"],
          summary: "This OpenAPI document",
          security: [],
          responses: { 200: { description: "OpenAPI 3.1 JSON" } },
        },
      },
    },
  };
}

export type OpenApiSpec = ReturnType<typeof buildSpec>;
