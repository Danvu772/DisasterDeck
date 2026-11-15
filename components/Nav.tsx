"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// One bar on every page. Desk is home, Agent is the end-user screen.
// Lab is a design tool, not a product page, so it sits apart on the right.
const LINKS = [
  { href: "/", label: "Desk" },
  { href: "/agent", label: "Agent" },
  { href: "/map", label: "Map" },
  { href: "/coordinator", label: "Coordinator" },
  { href: "/field", label: "Field" },
];

export function Nav({ account }: { account?: React.ReactNode }) {
  const path = usePathname();
  return (
    <nav className="flex shrink-0 items-baseline gap-4 border-b border-line bg-card px-4 py-2 text-sm">
      <Link href="/" className="font-bold">Disaster Desk</Link>
      <span className="text-muted">Malatya</span>
      {LINKS.map((l) => {
        const on = l.href === "/" ? path === "/" : path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href}
            className={`font-bold ${on ? "text-primary underline decoration-2 underline-offset-8" : "text-muted hover:text-primary"}`}>
            {l.label}
          </Link>
        );
      })}
      <Link href="/lab"
        className={`ml-auto ${path.startsWith("/lab") ? "text-primary underline" : "text-muted hover:text-primary"}`}>
        Design lab
      </Link>
      {account}
    </nav>
  );
}
