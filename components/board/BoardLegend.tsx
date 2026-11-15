// The board map's legend. The same swatches as /map's legend (tierBar, roadLine, the hatch),
// shorter, and folds away so it does not cover the markers. The full one with the NASA dates is on /map.
import Link from "next/link";
import { link, tierBar } from "../encode";
import { roadLine } from "../map/markers";

export function BoardLegend({ zones }: { zones: boolean }) {
  const dot = "inline-block h-3 w-3 rounded-full align-middle";
  const sq = "inline-block h-3 w-3 rounded-tag align-middle";
  return (
    <details open className="absolute bottom-6 left-3 z-[1000] max-w-56 rounded-card border border-line bg-card px-3 py-2 text-xs">
      <summary className="cursor-pointer font-bold text-primary underline hover:text-primary-dark">Legend</summary>
      <p className="mt-1"><span className={`${dot} ${tierBar(0)}`} /> Danger to life</p>
      <p><span className={`${dot} ${tierBar(1)}`} /> Urgent</p>
      <p><span className={`${dot} ${tierBar(2)}`} /> Comfort</p>
      <p className="mt-1"><span className={`${sq} rotate-45 ${tierBar(2)}`} /> Problem in the field</p>
      <p><span className={`${sq} ${tierBar(2)}`} /> Shelter, urgent when over 90% full</p>
      <p><span className={`inline-block h-2 w-5 bg-card align-middle ${roadLine(true)}`} /> Road closed, dashed when unconfirmed</p>
      {zones && (
        <p className="mt-1">
          <svg width="12" height="12" className="inline-block align-middle" aria-hidden>
            <rect x="1" y="1" width="10" height="10" className="fill-[url(#nasa-hatch)] stroke-hatch" strokeWidth="2" />
          </svg>{" "}
          NASA zone, cold or silent
        </p>
      )}
      <p className="mt-1 text-muted">Bigger means more people reported it. Faded means stale.</p>
      <Link href="/map" className={link}>Full legend on the map page</Link>
    </details>
  );
}
