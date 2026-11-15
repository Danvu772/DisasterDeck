// The loading block. A grey shape with a light sweep (the .skeleton class in globals.css).
// Every other loading piece is built from these, so one token change restyles all of them.
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`skeleton rounded-tag ${className}`} />;
}

// Text-shaped blocks. Pass widths to match the text they stand in for.
export function SkeletonLines({ widths = ["w-3/4", "w-1/2"] }: { widths?: string[] }) {
  return (
    <div className="space-y-2">
      {widths.map((w, i) => <Skeleton key={i} className={`h-3 ${w}`} />)}
    </div>
  );
}
