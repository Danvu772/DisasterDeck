"use client";
import { ExternalLink } from "lucide-react";
import { Tag } from "@trussworks/react-uswds";
import type { MetricResult } from "../types";
import { Bars } from "./Bars";
import { Gauge } from "./Gauge";
import { Matrix } from "./Matrix";
import { Snapshot } from "./Snapshot";
import { STATUS } from "./tone";

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
  const st = STATUS[r.status];
  return (
    <article className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs" aria-label={r.title}>
      <header className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold leading-snug">{r.title}</h3>
        <Tag className="shrink-0 font-normal">
          <span aria-hidden className={`size-1.5 rounded-full ${st.dot}`} />
          {st.word}
        </Tag>
      </header>
      {unknown
        ? <p className="rounded-lg bg-secondary px-3 py-2 text-sm text-muted-foreground">{r.unknownReason ?? r.headline}</p>
        : <>
            <p className="text-sm text-muted-foreground">{r.headline}</p>
            <Chart chart={r.chart} />
          </>}
      <footer className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
        <span className="min-w-0">{r.basis}</span>
        <a href={r.source.url} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline">
          {r.source.name}
          <ExternalLink aria-hidden className="size-3" />
        </a>
      </footer>
    </article>
  );
}
