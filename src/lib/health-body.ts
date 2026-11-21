// The body of GET /api/health: the queue health from lib/db (unchanged) plus `model`, the host and
// model ids the agents call (no key, nothing secret; D-0003, LLM-1). Kept here because a Next.js
// route file may export only its handlers.
import { modelInfo } from "@/agents/shared/llm";
import { getHealth } from "@/lib/db";
import type { Health } from "@/lib/types";

/** The model block alone: /api/health still reports it when the queue (MongoDB) cannot be read. */
export function modelBlock(): ReturnType<typeof modelInfo> {
  return modelInfo();
}

export type HealthBody = Health & { model: ReturnType<typeof modelInfo> };

export async function healthBody(queue: () => Promise<Health> = getHealth): Promise<HealthBody> {
  return { ...(await queue()), model: modelInfo() };
}
