"use client";
import Link from "next/link";
import type { MetricPoint } from "../types";
import { link } from "../../encode";
import { toneBg } from "./tone";
import { Count, Fill, fmtNum, unitText, useStagger } from "./motion";

export function Gauge({ point: p, unit }: { point: MetricPoint; unit?: string }) {
  const { entered, delay } = useStagger(0);
  const max = p.max ?? 100;
  const share = max > 0 ? Math.round((p.value / max) * 100) : 0;
  const u = unitText(unit);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-sm">
          {p.recordKey
            ? <Link href={`/?open=${encodeURIComponent(p.recordKey)}`} className={link}>{p.label}</Link>
            : p.label}
          <span className="sr-only">
            {`: ${fmtNum(p.value)} of ${fmtNum(max)}${u}, ${share} percent${p.note ? `, ${p.note}` : ""}`}
          </span>
        </div>
        <div aria-hidden className="text-4xl font-bold">
          <Count value={share} entered={entered} delay={delay} />
          <span className="font-mono">%</span>
        </div>
      </div>
      <div aria-hidden className="mt-1 h-4 bg-line">
        <Fill fraction={max > 0 ? p.value / max : 0} entered={entered} delay={delay} className={toneBg(p.tone)} />
      </div>
      <p aria-hidden className="mt-1 text-xs text-muted">
        <span className="font-mono">{fmtNum(p.value)}</span> of <span className="font-mono">{fmtNum(max)}</span>{u}
        {p.note ? `, ${p.note}` : ""}
      </p>
    </div>
  );
}
