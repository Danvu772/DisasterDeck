// What the chat box says when POST /api/chat does not give a reply.
// status 0 means the request never reached the server.
export function chatErrorText(status: number, body: unknown): string {
  if (status === 0) return "The desk agent is not reachable.";
  if (status === 502 || status === 500) {
    return "The desk agent did not answer. On this laptop the server may be missing OPENROUTER_API_KEY (see .env.example).";
  }
  const said = (body as { error?: unknown } | null)?.error;
  if (typeof said === "string" && said) return said;
  return `The desk agent did not answer, the server said ${status}.`;
}
