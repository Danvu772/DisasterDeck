"use client";
import { Count, useStagger } from "./motion";

function Cell({ count, top, index }: { count: number; top: number; index: number }) {
  const { entered, delay } = useStagger(index);
  // Shade tops out at 55% so the ink count stays readable on it.
  const opacity = entered && top > 0 ? (count / top) * 0.55 : 0;
  return (
    <td className="relative h-9 border border-line p-0 text-center align-middle">
      <div
        aria-hidden
        className="mc-shade absolute inset-0 bg-primary"
        style={{ opacity, transitionDelay: `${delay}ms` }}
      />
      <span className={`relative ${count === 0 ? "text-muted" : "text-ink"}`}>
        <span className="sr-only">{count}</span>
        <Count value={count} entered={entered} delay={delay} />
      </span>
    </td>
  );
}

export function Matrix({ rows, cols, cells, rowTitle, colTitle }: {
  rows: string[]; cols: string[]; cells: number[][]; rowTitle: string; colTitle: string;
}) {
  const top = Math.max(0, ...cells.flat());
  return (
    <table className="w-full table-fixed border-collapse text-sm">
      <caption className="sr-only">{`${rowTitle} by ${colTitle}, count per cell`}</caption>
      <thead>
        <tr>
          <th className="w-24 text-left text-xs font-normal text-muted" rowSpan={2} scope="col">{rowTitle}</th>
          <th className="pb-1 text-left text-xs font-normal text-muted" colSpan={cols.length} scope="colgroup">{colTitle}</th>
        </tr>
        <tr>
          {cols.map((c) => <th key={c} scope="col" className="font-mono text-xs font-normal">{c}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={r}>
            <th scope="row" className="pr-2 text-left font-mono text-xs font-normal">{r}</th>
            {cols.map((c, ci) => <Cell key={c} count={cells[ri]?.[ci] ?? 0} top={top} index={ri * cols.length + ci} />)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
