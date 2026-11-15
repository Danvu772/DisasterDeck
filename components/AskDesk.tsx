"use client";
// "Ask the desk": a read-only question box that posts to /api/chat as the person in ?user=.
import { useState } from "react";
import { ChatLine } from "./ChatLine";
import { button } from "./encode";

const NOT_ANSWERING = "The desk agent is not answering";

export function AskDesk() {
  const [text, setText] = useState("");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ask() {
    const q = text.trim();
    if (!q || asking) return;
    // Read the URL at submit time, so the board page needs no Suspense boundary.
    const user = new URLSearchParams(window.location.search).get("user") || "coordinator-duty";
    setAsking(true);
    setAnswer(null);
    setError(null);
    try {
      const r = await fetch(`/api/chat?user=${encodeURIComponent(user)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: q }),
      });
      const body = (await r.json().catch(() => null)) as { reply?: unknown; error?: unknown } | null;
      if (r.ok && typeof body?.reply === "string") setAnswer(body.reply);
      else if (typeof body?.error === "string") setError(body.error);
      else setError(NOT_ANSWERING);
    } catch {
      setError(NOT_ANSWERING);
    }
    setAsking(false);
  }

  return (
    <section aria-label="Ask the desk" className="mt-4">
      <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); void ask(); }}>
        <label htmlFor="ask-desk" className="text-sm font-bold">Ask the desk</label>
        <input id="ask-desk" value={text} onChange={(e) => setText(e.target.value)}
          placeholder="How full is Shelter B?"
          className="min-w-0 flex-1 rounded-button border border-muted px-2 py-1.5 text-sm" />
        <button className={button.primary} disabled={asking}>Ask</button>
      </form>
      <div className="mt-2 text-sm" aria-live="polite">
        {asking && <p className="text-muted">Asking</p>}
        {answer && <ChatLine m={{ from: "agent", text: answer }} name="" />}
        {error && <p>{error}</p>}
      </div>
    </section>
  );
}
