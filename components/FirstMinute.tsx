"use client";
// A slim one-line hint under the header. Shown once per browser per screen; closing it leaves a small Help button.
import { CircleHelp, Info, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export type Screen = "agent" | "coordinator" | "field";

export const FIRST_MINUTE: Record<Screen, string> = {
  agent: "Ask your agent anything, or tell it what happened.",
  coordinator: "Risky work waits here. Approve, send someone else, or reject.",
  field: "Your task is on top. Tap Problem if something goes wrong.",
};

const key = (s: Screen) => `desk-first-minute-${s}`;

function wasSeen(s: Screen): boolean {
  try { return localStorage.getItem(key(s)) === "seen"; } catch { return false; }
}

function remember(s: Screen) {
  try { localStorage.setItem(key(s), "seen"); } catch { /* private mode, the banner just shows again next visit */ }
}

export function FirstMinute({ screen }: { screen: Screen }) {
  // null until the browser has been asked, so the server render and first paint show nothing.
  const [open, setOpen] = useState<boolean | null>(null);
  useEffect(() => { setOpen(!wasSeen(screen)); }, [screen]);

  if (open === null) return null;

  if (!open) {
    return (
      <div className="flex justify-end px-4 pt-2 md:px-6">
        <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => setOpen(true)}>
          <CircleHelp aria-hidden />Help
        </Button>
      </div>
    );
  }

  return (
    <section aria-label="How this screen works" className="px-4 pt-3 md:px-6">
      <div className="mx-auto flex max-w-7xl items-center gap-2.5 rounded-xl border bg-card px-3 py-2 shadow-xs">
        <Info className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <p className="min-w-0 flex-1 text-sm">{FIRST_MINUTE[screen]}</p>
        <Button variant="ghost" size="icon-xs" aria-label="Close" className="shrink-0"
          onClick={() => { remember(screen); setOpen(false); }}>
          <X aria-hidden />
        </Button>
      </div>
    </section>
  );
}
