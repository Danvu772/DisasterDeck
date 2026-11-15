"use client";
// A slim banner under the header: what this screen is for, in three lines at most.
// Shown once per browser per screen. Closing it leaves a "How this screen works" link to bring it back.
// No motion, so nothing to switch off for prefers-reduced-motion.
import { useEffect, useState } from "react";
import { button, link } from "./encode";

export type Screen = "agent" | "coordinator" | "field";

export const FIRST_MINUTE: Record<Screen, string> = {
  agent: "You talk to your own agent. Ask it anything about the desk, or tell it what happened. Numbers come with a chart under the chat.",
  coordinator: "Risky work waits here for you. Approve, send someone else, or reject. Everything you decide goes into the record.",
  field: "Your current task is on top. Press On our way, Arrived, Done. Red Problem if something goes wrong. Hold to talk.",
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
      <div className="flex justify-end px-4 pt-2 text-sm">
        <button type="button" className={link} onClick={() => setOpen(true)}>How this screen works</button>
      </div>
    );
  }

  return (
    <section aria-label="How this screen works" className="border-b border-line bg-card px-4 py-2">
      <div className="mx-auto flex max-w-7xl items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-ink">{FIRST_MINUTE[screen]}</p>
        <button type="button" className={`${button.outline} shrink-0`}
          onClick={() => { remember(screen); setOpen(false); }}>
          Close
        </button>
      </div>
    </section>
  );
}
