"use client";
// Adapted from Watermelon UI "expandable-profile-card": a compact card that grows into a full panel
// with a shared-layout animation. Rebuilt for the desk: no stock photo (an initials avatar instead),
// tokens only, and the panel shows the person's context file (role, trust, skills, vehicle, stock, notes).
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ExpandablePersonCard({ id, name, subtitle, badge, children, className }: {
  id: string;
  name: string;
  subtitle: string;
  badge?: ReactNode;
  children: ReactNode;          // the expanded content
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const layoutId = `person-card-${id}`;
  const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  const avatar = (size: "sm" | "lg") => (
    <motion.div
      layoutId={`${layoutId}-avatar`}
      className={cn("flex shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground",
        size === "sm" ? "size-9 text-sm" : "size-14 text-lg")}
    >
      {initials}
    </motion.div>
  );

  return (
    <>
      <motion.button
        type="button"
        layoutId={layoutId}
        onClick={() => setOpen(true)}
        whileHover={{ y: -1 }}
        className={cn("flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left shadow-xs", className)}
      >
        {avatar("sm")}
        <div className="min-w-0 flex-1">
          <motion.p layoutId={`${layoutId}-name`} className="truncate text-sm font-semibold text-card-foreground">{name}</motion.p>
          <motion.p layoutId={`${layoutId}-sub`} className="truncate text-xs text-muted-foreground">{subtitle}</motion.p>
        </div>
        {badge}
      </motion.button>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-background/70 backdrop-blur-sm"
            />
            <motion.div
              layoutId={layoutId}
              className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border bg-card p-5 shadow-xl"
            >
              <button type="button" onClick={() => setOpen(false)} aria-label="Close"
                className="absolute top-3 right-3 flex size-8 items-center justify-center rounded-full border bg-background text-foreground hover:bg-accent">
                <X className="size-4" />
              </button>
              <div className="flex items-center gap-4 border-b pb-4">
                {avatar("lg")}
                <div className="min-w-0">
                  <motion.p layoutId={`${layoutId}-name`} className="text-xl font-semibold tracking-tight text-card-foreground">{name}</motion.p>
                  <motion.p layoutId={`${layoutId}-sub`} className="text-sm text-muted-foreground">{subtitle}</motion.p>
                </div>
              </div>
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
                transition={{ delay: 0.12 }}
                className="pt-4 text-sm text-card-foreground"
              >
                {children}
              </motion.div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
