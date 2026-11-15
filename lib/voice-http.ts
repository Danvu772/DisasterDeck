// Bound the actual stream, including chunked requests without Content-Length.
export async function voiceBody(req: Request, maxBytes = 4096): Promise<Record<string, unknown>> {
  const reader = req.body?.getReader();
  if (!reader) throw new Error("Missing request body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new Error("Request too large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid body");
  return body;
}
export function voiceOrigin(req: Request): boolean {
  // Next's internal Request URL can use localhost even when the browser used 127.0.0.1.
  // Read the actual Host, never untrusted forwarded-host/proto. Public proxies set an
  // explicit canonical origin in PUBLIC_APP_URL instead.
  const url = new URL(req.url);
  const expected = process.env.PUBLIC_APP_URL ? new URL(process.env.PUBLIC_APP_URL).origin : url.protocol + "//" + (req.headers.get("host") || url.host);
  return req.headers.get("origin") === expected;
}
export const voiceJson = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
