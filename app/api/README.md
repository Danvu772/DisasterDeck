# `app/api/`: the HTTP API

The endpoints are documented in one place: the **OpenAPI spec** in `lib/openapi.ts`, browsable
with **Swagger UI**. This file explains how to open it and how to keep it up to date. It does not
repeat what the endpoints do, so the two can't disagree.

| Route | Owner |
|---|---|
| `events/` | Role 1 |
| `chat/` | Role 2 |
| `auth/[...nextauth]/` | Role 3 (Auth.js / SSOJet, not in the API docs) |
| `openapi.json/`, `docs/` | Role 1 (the API docs themselves) |

## Open the API docs

```bash
npm run dev
```

Then open **http://localhost:3000/api/docs**. You get every endpoint with its request body (one
tab per event type), its responses, its rules, and ready-made examples. The raw spec is at
http://localhost:3000/api/openapi.json, for Postman, Insomnia or a client generator.

On a tunnel or a deployed server, use the same paths on that host.

## Call an endpoint from the page

1. Click **Authorize** (top right) and fill in **one** of these:
   - **`agentKey`**: the `AGENT_KEY` from `.env.local`. You act as a worker, like the X agent or
     the satellite watcher.
   - **`demoUser`**: a seeded user id. Only works when the server runs with `DEMO_MODE=1`. Try
     `coordinator-duty`, `field-alpha`, `supplier-primary` or `volunteer-callback`; the full
     list is in `data/seed.json`.
   - **`session`**: nothing to type. If you signed in at `/login` in this browser, the cookie is
     sent automatically.
2. Open an endpoint, click **Try it out**, pick an example from the **Examples** menu, edit it,
   and click **Execute**.

Swagger UI remembers what you authorized across reloads. Use **Logout** in the same dialog to
switch identity.

Requests made here are real: they go into the database the server is using (Atlas when
`MONGODB_URI` points there). Use a `dedupeKey` that starts with `check:` for test events, so
they're easy to find and delete.

## Add or change a route

Next.js can't discover routes or their bodies by itself, so `lib/openapi.ts` is the list.

1. Write the route in `app/api/<name>/route.ts`.
2. Add it under `paths` in `lib/openapi.ts`: method, summary, `security`, request body,
   responses and an example. If the body is a zod schema in `lib/schemas.ts`, reuse it with
   `jsonSchema(...)` so the docs match what the route accepts. If a route should not be
   documented, add its prefix to `UNDOCUMENTED` there instead.
3. Run `npm run api:check`. It fails, and names the route, when:
   - a route file is missing from the spec;
   - the spec lists a path with no route file;
   - their HTTP methods differ.

`lib/openapi.ts` is Role 1's file. If you own another route, tell Role 1 or add your entry and
mention it in your commit.
