"use client";
// A map answer in the /agent chart space: the records the agent's show_on_map matched, drawn with
// the same markers as /map. The tool's order is kept, so the first match is the target (earliest,
// nearest or simply first): the map flies to it and selects it. A row or a pin selects another.
// Records without coordinates are listed under the map, never guessed.
import dynamic from "next/dynamic";
import { useState } from "react";
import type { Site } from "@/lib/types";
import type { MapItem } from "../map/mapItems";
import { link, statusText } from "../encode";

const PinMap = dynamic(() => import("./PinMap"), {
  ssr: false,
  loading: () => <div aria-hidden className="h-72 w-full bg-line md:h-96" />,
});

const MAX_PINS = 50;

// The record ids of the agent's show_map action, in the tool's order. [] when it showed no map.
export function pinIds(body: unknown): string[] {
  const actions = (body as { actions?: unknown } | null)?.actions;
  if (!Array.isArray(actions)) return [];
  const ids = actions.flatMap((a) => {
    const { type, ids: xs } = (a ?? {}) as { type?: unknown; ids?: unknown };
    return type === "show_map" && Array.isArray(xs) ? xs.filter((x): x is string => typeof x === "string") : [];
  });
  return [...new Set(ids)].slice(0, MAX_PINS);
}

function detail(it: MapItem): string {
  const site = it.kind === "site" ? (it.record as Site) : undefined;
  return [site && `${site.peopleTrapped} trapped`, site?.hazard && `hazard: ${site.hazard}`, it.note, statusText(it.status)]
    .filter(Boolean).join(", ");
}

export function MapCard({ ids, items, now }: { ids: string[]; items: MapItem[]; now: number }) {
  const rank = new Map(ids.map((id, i) => [id, i]));
  const matched = items.filter((i) => rank.has(i.record._id))
    .sort((a, b) => rank.get(a.record._id)! - rank.get(b.record._id)!);
  const placed = matched.filter((i) => i.coords);
  const unplaced = matched.filter((i) => !i.coords);
  const [picked, setPicked] = useState<string | null>(null);
  const target = placed.some((i) => i.key === picked) ? picked! : placed[0]?.key;

  return (
    <section aria-label="Map" className="viz-in overflow-hidden rounded-card border border-line bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <p className="text-sm text-muted"><span className="font-mono">{placed.length}</span> on the map</p>
        {target && <a href={`/map?focus=${target}`} className={`${link} text-sm`}>Open on the full map</a>}
      </div>
      {placed.length > 0
        ? <PinMap placed={placed} now={now} target={target} onPick={setPicked} />
        : <p className="border-t border-line px-4 py-3 text-sm text-muted">Nothing to put on the map for this question.</p>}
      {placed.length > 0 && (
        <ul aria-label="On the map">
          {placed.map((it) => (
            <li key={it.key} className="border-t border-line">
              <button type="button" aria-pressed={it.key === target} onClick={() => setPicked(it.key)}
                className={`flex w-full flex-col px-4 py-2 text-left ${it.key === target ? "bg-primary-lighter" : "hover:bg-primary-lighter"}`}>
                <span className="truncate font-bold first-letter:uppercase">{it.title}</span>
                <span className="text-xs text-muted">{detail(it)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {unplaced.length > 0 && (
        <div className="border-t border-line px-4 py-2 text-sm">
          <p className="font-bold">No location yet (<span className="font-mono">{unplaced.length}</span>)</p>
          <ul>{unplaced.map((it) => <li key={it.key} className="text-muted first-letter:uppercase">{it.title}, {detail(it)}</li>)}</ul>
        </div>
      )}
    </section>
  );
}
