// A blank loading state: one animated surface that fills the box it is put in. No layout, no text on it.
// It appears after 300 ms (the .loading-surface class), so a fast answer never shows it.
import { Skeleton } from "./Skeleton";

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="loading-surface relative h-full min-h-40 w-full">
      <Skeleton className="absolute inset-0" />
    </div>
  );
}
