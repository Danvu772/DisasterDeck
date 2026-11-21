"use client";
import { useEffect, useRef, useState } from "react";
import "./charts.css";

export const STEP_MS = 40;
const DURATION_MS = 400;

// `entered` is false on the first paint, so a bar mounts empty and the CSS transition grows it.
// `delay` staggers the mount only. Once it settles, later changes tween with no delay.
export function useStagger(index: number) {
  const [entered, setEntered] = useState(false);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    const timer = setTimeout(() => setSettled(true), DURATION_MS + index * STEP_MS + 80);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [index]);
  return { entered, delay: settled ? 0 : index * STEP_MS };
}

export function fmtNum(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

// Counts up from the number on screen to `value`, written as plain text on each animation frame.
// It used to be a CSS counter on a registered custom property; Safari kept printing the first value
// (0 on every page load) because it does not repaint counter() when that property changes.
function useCountUp(target: number, entered: boolean, delay: number): number {
  const [shown, setShown] = useState(0);
  const at = useRef(0);
  useEffect(() => {
    if (!entered || at.current === target) return;
    const from = at.current;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const ms = still ? 0 : DURATION_MS;
    let raf = 0;
    let t0 = 0;
    const tick = (now: number) => {
      if (!t0) t0 = now + (still ? 0 : delay);
      const k = ms ? Math.min(1, Math.max(0, (now - t0) / ms)) : 1;
      const v = Math.round(from + (target - from) * (1 - (1 - k) ** 3));
      at.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, entered, delay]);
  return shown;
}

// The real number is in a visually hidden sibling, so this is aria-hidden.
// Non-integers skip the count-up and print as they are.
export function Count({ value, entered, delay }: { value: number; entered: boolean; delay: number }) {
  const whole = Number.isInteger(value) && value >= 0;
  const shown = useCountUp(whole ? value : 0, entered, delay);
  return <span aria-hidden className="font-mono tabular-nums">{whole ? shown : fmtNum(value)}</span>;
}

export function Fill({ fraction, entered, delay, className }: {
  fraction: number; entered: boolean; delay: number; className: string;
}) {
  const f = Math.min(1, Math.max(0, fraction));
  return (
    <div
      className={`mc-fill h-full w-full ${className}`}
      style={{ transform: `scaleX(${entered ? f : 0})`, transitionDelay: `${delay}ms` }}
    />
  );
}

export function unitText(unit?: string): string {
  if (!unit) return "";
  return unit === "%" ? "%" : ` ${unit}`;
}
