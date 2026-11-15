"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// One bar on every page. Desk is home, Agent is the end-user screen.
// Lab is a design tool, not a product page, so it sits apart on the right.
const LINKS = [
  { href: "/", label: "Desk" },
  { href: "/agent", label: "Agent" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex shrink-0 items-baseline gap-4 border-b border-line bg-card px-4 py-2 text-sm">
      <Link href="/" className="font-semibold">Disaster Desk</Link>
      <span className="font-mono text-xs text-muted">Malatya</span>
      {LINKS.map((l) => {
        const on = l.href === "/" ? path === "/" : path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href}
            className={on ? "underline underline-offset-4" : "text-muted hover:text-ink"}>
            {l.label}
          </Link>
        );
      })}
      <Link href="/lab"
        className={`ml-auto font-mono text-xs ${path.startsWith("/lab") ? "underline" : "text-muted hover:text-ink"}`}>
        lab (design)
      </Link>
    </nav>
  );
}
