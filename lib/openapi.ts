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
      { name: "events", description: "The way into memory (Role 1)" },
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
      "/api/events": {
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
                      dedupeKey: "nasa:malatya-2023:malatya-mor:cold:demo",
                      payload: { zoneId: "malatya-mor", kind: "cold", evidence: { minTempC: -14.4 } },
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
