"use client";
// One dark bar on every page, v2's TopBar composition on USWDS tokens.
// Desk is home, Agent is the end-user screen. Lab is a design tool, so it sits apart on the right.
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { users } from "@/fixtures/desk";
import { InboxBadge } from "./InboxBadge";
import { StatusPill } from "./StatusPill";

const LINKS = [
  { href: "/", label: "Desk" },
  { href: "/agent", label: "Agent" },
  { href: "/map", label: "Map" },
  { href: "/coordinator", label: "Coordinator" },
  { href: "/field", label: "Field" },
];

const nightPill = "whitespace-nowrap rounded-pill border border-night-muted px-2.5 py-1 text-xs";

// ?user=<id> is who presses the buttons on Agent, Coordinator and Field (demo only).
// The name comes from the demo roster, an unknown id shows as the id.
function ActingAs() {
  const id = useSearchParams().get("user");
  if (!id) return null;
  const name = users.find((u) => u._id === id)?.name;
  return (
    <span className={`hidden sm:inline ${nightPill} text-night-ink`}>
      Acting as {name ?? <span className="font-mono">{id}</span>}
    </span>
  );
}

export function Nav({ account }: { account?: React.ReactNode }) {
  const path = usePathname();
  // The redesign under /v2 draws its own header.
  if (path.startsWith("/v2")) return null;
  return (
    // The outer <nav> is what useNavBottom (detail/DetailPanel.tsx) measures, so it must stay the first <nav> on the page.
    <nav aria-label="Main" className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 bg-night px-4 py-2 text-sm text-night-ink">
      <Link href="/" className="flex shrink-0 items-center gap-2 font-bold text-night-ink">
        <svg width="24" height="24" viewBox="0 0 28 28" fill="none" aria-hidden="true">
          <rect x="1" y="1" width="26" height="26" rx="7" stroke="currentColor" strokeOpacity=".9" strokeWidth="2" />
          <path d="M8 18l4-8 4 6 3-4 2 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Disaster Desk
      </Link>
      <span className={`hidden sm:inline ${nightPill} text-night-muted`}>Antakya historical exercise</span>
      <div className="order-last flex w-full min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap lg:order-none lg:w-auto lg:flex-1">
        {LINKS.map((l) => {
          const on = l.href === "/" ? path === "/" : path.startsWith(l.href);
          return (
            <Link key={l.href} href={l.href} aria-current={on ? "page" : undefined}
              className={`rounded-pill px-3 py-1 font-bold ${on ? "bg-night-ink text-ink" : "text-night-ink hover:underline"}`}>
              {l.label}
            </Link>
          );
        })}
        <Link href="/lab" aria-current={path.startsWith("/lab") ? "page" : undefined}
          className={`ml-auto hidden rounded-pill px-3 py-1 sm:inline-block ${path.startsWith("/lab") ? "bg-night-ink text-ink" : "text-night-muted hover:underline"}`}>
          Design lab
        </Link>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-3 lg:ml-0">
        <Suspense fallback={null}><ActingAs /></Suspense>
        <InboxBadge />
        {account}
        <StatusPill />
      </div>
    </nav>
  );
}
