"use client";
// Unread count in the header. Polls GET /api/inbox every 5 s.
// The person is the session, or ?user= on this laptop. When the API refuses (nobody identified), it renders nothing.
import { useSearchParams } from "next/navigation";
import { CheckCheck, Inbox } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Suspense, useEffect, useState } from "react";
import type { InboxItem } from "@/lib/types";
import { ageText } from "./encode";

// Approvals and incidents need a person now, everything else is just news.
export function needsAction(items: InboxItem[]): boolean {
  return items.some((i) => i.kind === "approval" || i.kind === "incident");
}

function Badge() {
  const user = useSearchParams().get("user");
  const url = user ? `/api/inbox?user=${encodeURIComponent(user)}` : "/api/inbox";
  const [items, setItems] = useState<InboxItem[] | null>(null); // null: nobody identified or no answer
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (!stop) setItems(r.ok ? ((await r.json()) as InboxItem[]) : null);
        if (r.status === 401) return; // nobody signed in: stop polling
      } catch {
        if (!stop) setItems(null);
      }
      if (stop) return;
      setNow(Date.now());
      timer = setTimeout(tick, 5000);
    }
    tick();
    return () => { stop = true; clearTimeout(timer); };
  }, [url]);

  async function markAllRead() {
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      if (r.ok) setItems([]);
    } catch {
      // the next poll shows what is still unread
    }
  }

  if (!items) return null;
  const act = needsAction(items);
  return (
    <div className="relative">
      <button type="button" aria-expanded={open} aria-label={`Inbox, ${items.length} unread`}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium transition-colors ${
          act ? "border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90" : "bg-background hover:bg-secondary"}`}>
        <Inbox className="size-3.5" aria-hidden />
        <span className="font-mono">{items.length}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 400, damping: 34 }}
            className="absolute right-0 z-50 mt-2 w-80 origin-top-right rounded-xl border bg-popover p-1.5 text-sm text-popover-foreground shadow-lg">
            <div className="flex items-center justify-between px-2 py-1.5">
              <p className="text-sm font-semibold">Inbox</p>
              {items.length > 0 && (
                <button type="button" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={markAllRead}>
                  <CheckCheck className="size-3.5" aria-hidden />Mark all read
                </button>
              )}
            </div>
            {items.length === 0 && <p className="px-2 pb-3 pt-1 text-muted-foreground">You are all caught up.</p>}
            <ul className="max-h-72 overflow-y-auto">
              {items.map((i) => {
                const urgent = i.kind === "approval" || i.kind === "incident";
                return (
                  <li key={i._id} className="flex gap-2.5 rounded-lg px-2 py-2 hover:bg-secondary/70">
                    <span aria-hidden className={`mt-1.5 size-1.5 shrink-0 rounded-full ${urgent ? "bg-destructive" : "bg-border"}`} />
                    <span className="min-w-0">
                      <span className="block">{i.message}</span>
                      <span className="block text-xs text-muted-foreground" suppressHydrationWarning>{ageText(i.ts, now)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function InboxBadge() {
  return <Suspense fallback={null}><Badge /></Suspense>;
}
