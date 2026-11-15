// The loading surface: a flat grey block with a light sweep across it (the .skeleton class in globals.css).
// Nothing is drawn on it. It stays until the real content replaces it.
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`skeleton ${className}`} />;
}
