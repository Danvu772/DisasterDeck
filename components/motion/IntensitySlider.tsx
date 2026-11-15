"use client";
// Adapted from Watermelon UI "adaptive-slider" (registry.watermelon.sh): a chunky slider whose fill
// springs to the value and whose number rolls digit by digit. Rebuilt on the desk's tokens: a primary
// fill, or with `severity` a calm → warning → destructive fill as the value rises. Any label and unit.
import { AnimatePresence, motion } from "motion/react";
import type { ChangeEvent } from "react";
import { cn } from "@/lib/utils";

export function IntensitySlider({ label, value, min, max, step, unit, format, onChange, className, severity = false }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  className?: string;
  severity?: boolean;          // colour the fill by how high the value is (for a risk or a load)
}) {
  const pct = ((value - min) / (max - min)) * 100;
  const fill = !severity ? "bg-primary" : pct < 50 ? "bg-calm" : pct < 80 ? "bg-warning" : "bg-destructive";
  const shown = format ? format(value) : String(value);

  return (
    <div className={cn("w-full select-none", className)}>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="flex items-baseline gap-1 font-mono text-sm font-semibold text-foreground">
          <RollingNumber value={shown} />
          {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
        </span>
      </div>
      <div className="relative flex h-8 w-full items-center overflow-hidden rounded-lg bg-secondary">
        <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-4">
          {Array.from({ length: 6 }).map((_, i) => <span key={i} className="size-1 rounded-full bg-border" />)}
        </div>
        <motion.div
          className={cn("pointer-events-none absolute top-0 left-0 h-full rounded-lg transition-colors", fill)}
          animate={{ width: `calc((${pct} / 100) * (100% - 32px) + 32px)` }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        />
        <motion.div
          className="pointer-events-none absolute top-0 z-10 flex size-8 items-center justify-center"
          animate={{ left: `calc((${pct} / 100) * (100% - 32px))` }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
          <div className="size-6 rounded-md bg-background shadow-sm" />
        </motion.div>
        <input
          aria-label={label}
          type="range" min={min} max={max} step={step} value={value}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(Number(e.target.value))}
          className="absolute inset-0 z-20 h-full w-full cursor-pointer opacity-0"
        />
      </div>
    </div>
  );
}

function RollingNumber({ value }: { value: string }) {
  return (
    <span className="flex overflow-hidden">
      <AnimatePresence mode="popLayout" initial={false}>
        {value.split("").map((ch, i) => (
          <motion.span
            key={ch + i}
            initial={{ y: "-60%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "60%", opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
          >
            {ch}
          </motion.span>
        ))}
      </AnimatePresence>
    </span>
  );
}
