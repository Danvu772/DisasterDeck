"use client";
// Unread count next to "Acting as" in the header. Polls GET /api/inbox every 5 s.
// The person is the session, or ?user= on this laptop. When the API refuses (nobody identified), it renders nothing.
import { useSearchParams } from "next/navigation";
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
        className={`whitespace-nowrap rounded-pill border px-2.5 py-1 text-xs ${
          act ? "border-act bg-act font-bold text-card" : "border-night-muted text-night-ink"}`}>
        Inbox <span className="font-mono">{items.length}</span>
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-72 rounded-card border border-line bg-card p-2 text-sm text-ink">
          {items.length === 0 && <p className="p-1 text-muted">Nothing unread.</p>}
          <ul className="max-h-64 overflow-y-auto">
            {items.map((i) => (
              <li key={i._id} className="border-b border-line p-1 last:border-b-0">
                <p>{i.message}</p>
                <p className="text-xs text-muted">{ageText(i.ts, now)}</p>
              </li>
            ))}
          </ul>
          {items.length > 0 && (
            <button type="button" className="mt-2 text-sm font-bold text-primary hover:text-primary-dark" onClick={markAllRead}>
              Mark all read
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function InboxBadge() {
  return <Suspense fallback={null}><Badge /></Suspense>;
}
