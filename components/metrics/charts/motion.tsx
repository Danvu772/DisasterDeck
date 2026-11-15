"use client";
import { useEffect, useState, type CSSProperties } from "react";
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

// Counts up with a CSS counter. The real number is in a visually hidden sibling, so this is aria-hidden.
// Non-integers skip the count-up, a CSS counter only prints whole numbers.
export function Count({ value, entered, delay }: { value: number; entered: boolean; delay: number }) {
  if (!Number.isInteger(value) || value < 0) {
    return <span aria-hidden className="font-mono">{fmtNum(value)}</span>;
  }
  const style = { "--mc-n": entered ? value : 0, transitionDelay: `${delay}ms` } as CSSProperties;
  return <span aria-hidden className="mc-num font-mono" style={style} />;
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
