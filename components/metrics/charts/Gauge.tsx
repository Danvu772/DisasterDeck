"use client";
import Link from "next/link";
import type { MetricPoint } from "../types";
import { toneBg } from "./tone";
import { Count, Fill, fmtNum, unitText, useStagger } from "./motion";

export function Gauge({ point: p, unit }: { point: MetricPoint; unit?: string }) {
  const { entered, delay } = useStagger(0);
  const max = p.max ?? 100;
  const share = max > 0 ? Math.round((p.value / max) * 100) : 0;
  const u = unitText(unit);
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div aria-hidden className="text-3xl font-semibold tracking-tight tabular-nums">
          <Count value={share} entered={entered} delay={delay} />
          <span className="font-mono text-xl text-muted-foreground">%</span>
        </div>
        <p aria-hidden className="pb-1 text-xs text-muted-foreground">
          <span className="font-mono text-foreground">{fmtNum(p.value)}</span> / <span className="font-mono">{fmtNum(max)}</span>{u}
        </p>
      </div>
      <div aria-hidden className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
        <Fill fraction={max > 0 ? p.value / max : 0} entered={entered} delay={delay} className={`rounded-full ${toneBg(p.tone)}`} />
      </div>
      <div className="mt-2 text-xs text-muted-foreground">
        {p.recordKey
          ? <Link href={`/?open=${encodeURIComponent(p.recordKey)}`} className="font-medium text-foreground underline-offset-4 hover:underline">{p.label}</Link>
          : p.label}
        <span className="sr-only">
          {`: ${fmtNum(p.value)} of ${fmtNum(max)}${u}, ${share} percent${p.note ? `, ${p.note}` : ""}`}
        </span>
      </div>
    </div>
  );
}
