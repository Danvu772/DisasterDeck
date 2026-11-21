"use client";
// "Ask the desk": a read-only question box that posts to /api/chat as the person in ?user=.
// The answer comes with up to two live metric cards, also when the agent is down.
import { ArrowUp, LoaderCircle, Sparkles, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Button } from "@trussworks/react-uswds";
import { ChatLine } from "./ChatLine";
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

  const clear = () => { setAnswer(null); setError(null); setCharts(null); };
  const shown = asking || answer || error || charts;

  return (
    <section aria-label="Ask the desk">
      <form className="relative" onSubmit={(e) => { e.preventDefault(); void ask(); }}>
        <label htmlFor="ask-desk" className="sr-only">Ask the desk</label>
        <Sparkles className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-info" aria-hidden />
        <input id="ask-desk" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off"
          placeholder="Ask the desk anything…"
          className="h-10 w-full rounded-xl border border-input bg-background pl-9 pr-11 text-sm shadow-xs outline-none transition-[box-shadow,border-color] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
        <Button type="submit" disabled={asking || !text.trim()} aria-label="Ask"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg">
          {asking ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden /> : <ArrowUp aria-hidden />}
        </Button>
      </form>
      <AnimatePresence initial={false}>
        {shown && (
          <motion.div key="answer" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", stiffness: 340, damping: 36 }} className="overflow-hidden">
            {/* Capped, so two cards do not push the list below off the screen. */}
            <div className="relative mt-2 flex max-h-[60vh] flex-col gap-2 overflow-y-auto text-sm" aria-live="polite">
              {!asking && (
                <Button type="button" unstyled aria-label="Clear the answer" onClick={clear}
                  className="absolute right-0 top-0 z-10 inline-flex items-center justify-center rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                  <X aria-hidden />
                </Button>
              )}
              {asking && <p className="text-xs text-muted-foreground">Asking</p>}
              {answer && <ChatLine m={{ from: "agent", text: answer }} name="" />}
              {error && <p className="pr-7 text-xs text-muted-foreground">{error}</p>}
              {charts && <ChatMetrics key={charts.key} ids={charts.ids} active user={charts.user} />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
