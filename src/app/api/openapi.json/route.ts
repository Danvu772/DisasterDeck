// Owned by Role 1. GET /api/openapi.json: the API description that /api/docs renders.
import { buildSpec } from "@/lib/openapi";

export const runtime = "nodejs";

const spec = buildSpec();

export function GET(): Response {
  return Response.json(spec, { headers: { "cache-control": "no-store" } });
}
