"use client";
// "Ask the desk": a read-only question box that posts to /api/chat as the person in ?user=.
// The answer comes with up to two live metric cards, also when the agent is down.
import { useState } from "react";
import { ChatLine } from "./ChatLine";
import { button } from "./encode";
import { chatErrorText } from "./chatError";
import { ChatMetrics } from "./metrics/ChatMetrics";
import { pickMetrics } from "./metrics/useMetrics";
import type { MetricId } from "./metrics/types";

export function AskDesk() {
  const [text, setText] = useState("");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // One entry per answer. The key remounts the cards, so a new answer animates in fresh.
  const [charts, setCharts] = useState<{ key: number; ids: MetricId[]; user: string } | null>(null);

  async function ask() {
    const q = text.trim();
    if (!q || asking) return;
    // Read the URL at submit time, so the board page needs no Suspense boundary.
    const user = new URLSearchParams(window.location.search).get("user") || "coordinator-duty";
    setAsking(true);
    setAnswer(null);
    setError(null);
    setCharts(null);
    let body: unknown = null;
    try {
      const r = await fetch(`/api/chat?user=${encodeURIComponent(user)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: q }),
      });
      body = await r.json().catch(() => null);
      const reply = (body as { reply?: unknown } | null)?.reply;
      if (r.ok && typeof reply === "string") setAnswer(reply);
      else setError(chatErrorText(r.ok ? 502 : r.status, body));
    } catch {
      setError(chatErrorText(0, null));
    }
    setCharts({ key: Date.now(), ids: pickMetrics(q, body), user });
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
      {/* Capped, so two cards do not push the list below off the screen. */}
      <div className="mt-2 flex max-h-[60vh] flex-col gap-2 overflow-y-auto text-sm" aria-live="polite">
        {asking && <p className="text-muted">Asking</p>}
        {answer && <ChatLine m={{ from: "agent", text: answer }} name="" />}
        {error && <p>{error}</p>}
        {charts && <ChatMetrics key={charts.key} ids={charts.ids} active user={charts.user} />}
      </div>
    </section>
  );
}
