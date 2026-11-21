"use client";
// "Priority 54" as a button. Opens a small popover with the parts that add up to it.
// Without scoreParts there is nothing to show, so the number stays plain text.
import { useEffect, useId, useRef, useState } from "react";
import type { RecordType, ScorePart } from "@/lib/types";

const CASE_WORD: Partial<Record<RecordType | "task", string>> = { site: "Site", need: "Need", incident: "Problem" };

// "Site 57". Nothing when the record has no case number or no word for its kind.
export function CaseNo({ kind, no }: { kind: string; no?: number }) {
  const word = CASE_WORD[kind as RecordType];
  if (no === undefined || !word) return null;
  return <>{word} <span className="font-mono">{no}</span></>;
}

export function ScoreBreakdown({ priority, parts, stacked = false, className = "" }: {
  priority: number; parts?: ScorePart[]; stacked?: boolean; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, [open]);

  const label = stacked
    ? <span className="flex flex-col items-end"><span className="font-mono text-sm font-bold">{priority}</span><span className="text-xs">priority</span></span>
    : <>Priority <span className="font-mono">{priority}</span></>;

  if (!parts || parts.length === 0) {
    return <span className={`whitespace-nowrap text-xs text-muted ${className}`}>{label}</span>;
  }

  return (
    <span ref={box} className={`relative inline-block ${className}`}>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}
        className="whitespace-nowrap text-xs text-primary underline hover:text-primary-dark">{label}</button>
      {open && (
        <span id={id} role="dialog" aria-label="Why it ranks here"
          className="absolute right-0 top-full z-20 mt-1 block w-64 rounded-card border border-line bg-card p-3 text-left text-sm font-normal text-ink shadow-md">
          <span className="block font-bold">Why it ranks here</span>
          <ul className="mt-1 space-y-0.5">
            {parts.map((p) => <li key={p.name}>{p.name}, <span className="font-mono">{p.value}</span></li>)}
          </ul>
          <span className="mt-1 block border-t border-line pt-1 font-bold">Total <span className="font-mono">{priority}</span></span>
          <span className="mt-1 block text-xs text-muted">Tier first, then this score. A coordinator can override it.</span>
        </span>
      )}
    </span>
  );
}
