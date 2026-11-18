// Where model calls go, and the production guard on it (D-0003, LLM-1). No Node-only imports, so
// instrumentation.ts can load it in any Next.js runtime. agents/shared/llm.ts re-exports it.

export const DEFAULT_BASE_URL = "https://us.openrouter.ai/api/v1";

/** The only model host production may use: OpenRouter's US in-region endpoint. */
export const US_HOST = "us.openrouter.ai";

export class ModelHostError extends Error {}

export function baseUrl(): string {
  return (process.env.OPENROUTER_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export function hostOf(url: string): string | undefined {
  try { return new URL(url).hostname; } catch { return undefined; }
}

/**
 * In production (NODE_ENV=production) the model host must be us.openrouter.ai over https. The server
 * checks this at startup (instrumentation.ts), and every call checks it again before any request.
 * Elsewhere (laptops, tests) OPENROUTER_BASE_URL may point anywhere.
 */
export function assertModelHost(): void {
  if (process.env.NODE_ENV !== "production") return;
  const url = baseUrl();
  let ok = false;
  try { const u = new URL(url); ok = u.protocol === "https:" && u.hostname === US_HOST; } catch { /* not a URL */ }
  if (!ok) {
    throw new ModelHostError(`Refusing to run: OPENROUTER_BASE_URL points at "${hostOf(url) ?? "not a URL"}", but production may only call https://${US_HOST} (D-0003). Unset it or set it to ${DEFAULT_BASE_URL}.`);
  }
}

/**
 * The server's startup check (instrumentation.ts). Next.js only logs an error thrown by its
 * instrumentation hook and keeps the process up, answering 500s, so a wrong host exits instead:
 * the server does not start. `exit` is injectable for tests.
 */
export function startupCheck(exit: (code: number) => void): void {
  try {
    assertModelHost();
  } catch (e) {
    console.error(`[startup] ${(e as Error).message}`);
    exit(1);
    throw e;
  }
}
