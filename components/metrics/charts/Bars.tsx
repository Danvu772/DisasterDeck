"use client";
import Link from "next/link";
import type { MetricPoint } from "../types";
import { link } from "../../encode";
import { toneBg } from "./tone";
import { Count, Fill, fmtNum, unitText, useStagger } from "./motion";

function Row({ p, unit, index, scale }: { p: MetricPoint; unit?: string; index: number; scale: number }) {
  const { entered, delay } = useStagger(index);
  const total = p.max ?? scale;
  const u = unitText(unit);
  return (
    <li className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-x-3 text-sm">
      <div className="min-w-0">
        {p.recordKey
          ? <Link href={`/?open=${encodeURIComponent(p.recordKey)}`} className={link}>{p.label}</Link>
          : <span>{p.label}</span>}
      </div>
      <div className="h-3 bg-line" aria-hidden>
        <Fill fraction={total > 0 ? p.value / total : 0} entered={entered} delay={delay} className={toneBg(p.tone)} />
      </div>
      <div className="text-right">
        <span className="sr-only">
          {`: ${fmtNum(p.value)}${p.max !== undefined ? ` of ${fmtNum(p.max)}` : ""}${u}${p.note ? `, ${p.note}` : ""}`}
        </span>
        <Count value={p.value} entered={entered} delay={delay} />
        {p.max !== undefined && <span aria-hidden> of <span className="font-mono">{fmtNum(p.max)}</span></span>}
        <span aria-hidden>{u}</span>
      </div>
    </li>
  );
}

export function Bars({ points, unit }: { points: MetricPoint[]; unit?: string }) {
  const scale = Math.max(0, ...points.map((p) => p.value));
  return (
    <ul className="space-y-2">
      {points.map((p, i) => <Row key={p.label} p={p} unit={unit} index={i} scale={scale} />)}
    </ul>
  );
}
