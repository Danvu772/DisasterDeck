// The six product screens (SYSTEM_DESIGN §3.3, D-0001), in nav order. The header and the footer
// both list them. /agent, /lab, /demo, /compare and /v2 stay reachable by URL only.
export const SCREENS = [
  { href: "/", label: "Desk" },
  { href: "/field", label: "Field" },
  { href: "/talk", label: "Talk" },
  { href: "/coordinator", label: "Coordinator" },
  { href: "/map", label: "Map" },
  { href: "/ops", label: "Ops" },
] as const;

/** Is `href` the screen at `path`? "/" only matches itself. */
export function isCurrent(href: string, path: string): boolean {
  return href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
}
