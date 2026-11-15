"use client";
import type { MetricResult } from "../types";
import { link, statusTag } from "../../encode";
import { Bars } from "./Bars";
import { Gauge } from "./Gauge";
import { Matrix } from "./Matrix";
import { Snapshot } from "./Snapshot";

function Chart({ chart }: { chart: MetricResult["chart"] }) {
  switch (chart.kind) {
    case "bars": return <Bars points={chart.points} unit={chart.unit} />;
    case "gauge": return <Gauge point={chart.point} unit={chart.unit} />;
    case "matrix": return <Matrix {...chart} />;
    case "snapshot": return <Snapshot rows={chart.rows} />;
    case "none": return null;
  }
}

export function MetricCard({ result: r }: { result: MetricResult }) {
  const unknown = r.status === "unknown";
  return (
    <article className="rounded-card border border-line bg-card p-4" aria-label={r.title}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-bold">{r.title}</h3>
        <span className={statusTag}>{r.status}</span>
      </div>
      <p className="mt-1">{r.headline}</p>
      {unknown
        ? <p className="mt-3 text-sm text-muted">{r.unknownReason}</p>
        : <div className="mt-3"><Chart chart={r.chart} /></div>}
      <p className="mt-3 text-xs text-muted">{r.basis}</p>
      <p className="text-xs text-muted">
        Source: <a href={r.source.url} target="_blank" rel="noreferrer" className={link}>{r.source.name}</a>
      </p>
    </article>
  );
}
