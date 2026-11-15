// The desk while the database answers. Same grid and the same placements as LiveBoard,
// so the real board drops into these boxes without moving anything.
import { Skeleton, SkeletonLines } from "./Skeleton";

const card = "min-h-0 min-w-0 rounded-card border border-line bg-card";
const rows = Array.from({ length: 6 }, (_, i) => i);
const feedRows = Array.from({ length: 4 }, (_, i) => i);

export function BoardSkeleton() {
  return (
    <div role="status" aria-label="Loading the desk"
      className="grid gap-4 p-4 md:grid-cols-2 xl:h-full xl:grid-cols-[380px_minmax(0,1fr)_400px] xl:grid-rows-[minmax(0,1fr)_14rem]">
      <section className={`${card} flex flex-col md:col-start-1 md:row-start-2 md:max-h-[80vh] xl:row-span-2 xl:row-start-1 xl:max-h-none`}>
        <div className="flex shrink-0 flex-col gap-3 border-b border-line p-3">
          <div className="flex gap-2">
            {rows.slice(0, 3).map((i) => <Skeleton key={i} className="h-7 w-20 rounded-pill" />)}
          </div>
          <Skeleton className="h-9 w-full rounded-button" />
          <div className="flex flex-wrap gap-1.5">
            {rows.slice(0, 5).map((i) => <Skeleton key={i} className="h-7 w-16 rounded-pill" />)}
          </div>
        </div>
        <ul className="min-h-0 flex-1 space-y-4 p-3 md:overflow-y-auto">
          {rows.map((i) => (
            <li key={i} className="space-y-2 border-b border-line pb-4">
              <Skeleton className="h-4 w-2/3" />
              <SkeletonLines widths={["w-1/2"]} />
            </li>
          ))}
        </ul>
      </section>

      <div className={`${card} relative hidden overflow-hidden md:col-span-2 md:row-start-1 md:block md:h-[45vh] xl:col-span-1 xl:col-start-2 xl:row-start-1 xl:h-auto`}>
        <div className="absolute inset-0"><Skeleton className="h-full w-full rounded-none" /></div>
      </div>

      <div className="flex h-80 min-h-0 flex-col gap-2 rounded-card border border-line bg-card p-3 md:col-span-2 md:row-start-3 xl:col-span-1 xl:col-start-2 xl:row-start-2 xl:h-auto">
        {feedRows.map((i) => <SkeletonLines key={i} widths={["w-5/6", "w-1/3"]} />)}
      </div>

      <aside aria-hidden className="hidden min-h-0 min-w-0 flex-col gap-3 rounded-card border border-line bg-card p-4 md:static md:col-start-2 md:row-start-2 md:flex md:max-h-[80vh] xl:col-start-3 xl:row-span-2 xl:row-start-1 xl:max-h-none">
        <Skeleton className="h-5 w-1/2" />
        <SkeletonLines widths={["w-full", "w-5/6", "w-2/3"]} />
        <Skeleton className="mt-2 h-32 w-full" />
      </aside>
    </div>
  );
}
