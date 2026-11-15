"use client";
// Adapted from Watermelon UI "shuffle-pinned-item": a list where pinned items rise into a hero pill
// at the top; tapping the hero cycles through the pinned ones with a blur-swap. Rebuilt for the desk:
// tokens only, Lucide icons only (no react-icons), each row carries a tier and a short note.
// Used for a person's own list: their tasks and the needs they filed, top one pinned.
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { ChevronsUpDown, Pin, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { taskTitle } from "@/components/detail/fields";

export interface PinnedItem {
  id: string;
  title: string;
  note?: string;
  icon: LucideIcon;
  tone: "act" | "urgent" | "calm";
  pinned?: boolean;
}

const TONE: Record<PinnedItem["tone"], string> = {
  act: "bg-destructive text-primary-foreground",
  urgent: "bg-warning text-warning-foreground",
  calm: "bg-secondary text-secondary-foreground",
};

export function PinnedList({ items: start, title = "Your list", empty = "Nothing on your list." }: {
  items: PinnedItem[];
  title?: string;
  empty?: string;
}) {
  const [items, setItems] = useState(start);
  const [hero, setHero] = useState(0);
  const pinned = useMemo(() => items.filter((i) => i.pinned), [items]);
  const current = pinned[hero % Math.max(pinned.length, 1)];

  const toggle = (id: string) => setItems((xs) => {
    const next = xs.map((i) => (i.id === id ? { ...i, pinned: !i.pinned } : i));
    const nowPinned = next.filter((i) => i.pinned);
    const idx = nowPinned.findIndex((i) => i.id === id);
    setHero(idx >= 0 ? idx : Math.min(hero, Math.max(nowPinned.length - 1, 0)));
    return next;
  });

  return (
    <MotionConfig transition={{ type: "spring", stiffness: 400, damping: 40 }}>
      <motion.div layout className="space-y-2 rounded-xl border bg-card p-3 shadow-xs">
        <AnimatePresence mode="popLayout">
          {current && (
            <motion.button
              type="button"
              key="hero"
              layout
              initial={{ opacity: 0, scale: 0.9, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -10 }}
              onClick={() => pinned.length > 1 && setHero((h) => (h + 1) % pinned.length)}
              className="flex w-full items-center gap-3 rounded-full bg-secondary p-1.5 pr-3 text-left"
            >
              <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", TONE[current.tone])}>
                <current.icon className="size-5" />
              </span>
              <AnimatePresence mode="popLayout">
                <motion.span
                  key={current.id}
                  initial={{ opacity: 0, scale: 0.8, filter: "blur(6px)" }}
                  animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, scale: 0.8, filter: "blur(6px)" }}
                  transition={{ duration: 0.5, type: "spring", bounce: 0 }}
                  className="min-w-0 flex-1"
                >
                  <span className="line-clamp-2 text-sm font-semibold text-foreground">{taskTitle(current.title)}</span>
                  {current.note && <span className="block truncate text-xs text-muted-foreground">{current.note}</span>}
                </motion.span>
              </AnimatePresence>
              {pinned.length > 1 && <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />}
            </motion.button>
          )}
        </AnimatePresence>

        <motion.p layout className="px-1 pt-1 text-xs font-medium text-muted-foreground">{title}</motion.p>
        {items.length === 0 && <p className="px-1 pb-1 text-sm text-muted-foreground">{empty}</p>}
        <ul className="space-y-0.5">
          <AnimatePresence initial={false}>
            {items.map((i) => (
              <motion.li
                layout key={i.id}
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                className="group flex items-center gap-3 rounded-full p-1 pr-1.5 transition-colors hover:bg-accent"
              >
                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", TONE[i.tone])}>
                  <i.icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm font-medium text-foreground">{taskTitle(i.title)}</span>
                  {i.note && <span className="block truncate text-xs text-muted-foreground">{i.note}</span>}
                </span>
                <button
                  type="button" onClick={() => toggle(i.id)} aria-label={i.pinned ? "Unpin" : "Pin"}
                  className={cn("flex size-8 shrink-0 items-center justify-center rounded-full transition-opacity",
                    i.pinned ? "text-foreground opacity-100" : "text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100")}
                >
                  <Pin className="size-4" fill={i.pinned ? "currentColor" : "none"} />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </motion.div>
    </MotionConfig>
  );
}
