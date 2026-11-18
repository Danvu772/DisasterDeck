// Next.js runs register() once when the server starts. Production refuses to start when the model
// host is not OpenRouter's US endpoint (D-0003, LLM-1): the process exits with code 1.
// agents/shared/llm.ts checks the host again on every call.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startupCheck } = await import("./agents/shared/model-host");
  startupCheck((code) => process.exit(code));
}
