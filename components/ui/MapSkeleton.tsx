// A map frame while Leaflet and its tiles load. Fills whatever box it is put in.
import { Skeleton } from "./Skeleton";

export function MapSkeleton() {
  return (
    <div role="status" aria-label="Loading the map" className="relative h-full min-h-40 w-full">
      <Skeleton className="absolute inset-0 rounded-none" />
    </div>
  );
}
