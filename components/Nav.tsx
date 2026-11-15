"use client";
// One bar on every page: the desk's name, the screens, and the desk's health on the right.
// Desk is home, Agent and Talk are the end-user screens. /lab stays reachable by URL only.
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { users } from "@/fixtures/desk";
import { cn } from "@/lib/utils";
import { InboxBadge } from "./InboxBadge";
import { StatusPill } from "./StatusPill";
import { ThemeToggle } from "./theme/theme";

const LINKS = [
  { href: "/", label: "Desk" },
  { href: "/agent", label: "Agent" },
  { href: "/map", label: "Map" },
  { href: "/ops", label: "Ops room" },
  { href: "/coordinator", label: "Coordinator" },
  { href: "/field", label: "Field" },
  { href: "/talk", label: "Talk" },
  { href: "/voice", label: "Voice" },
];

// ?user=<id> is who presses the buttons on Agent, Coordinator and Field (demo only).
function ActingAs() {
  const id = useSearchParams().get("user");
  if (!id) return null;
  const name = users.find((u) => u._id === id)?.name ?? id;
  const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <span className="hidden items-center gap-2 rounded-full border bg-background py-0.5 pr-2.5 pl-0.5 text-xs md:inline-flex">
      <span className="flex size-6 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">{initials}</span>
      {name}
    </span>
  );
}

export function Nav({ account }: { account?: React.ReactNode }) {
  const path = usePathname();
  // The redesign under /v2 draws its own header.
  if (path.startsWith("/v2")) return null;
  return (
    // The outer <nav> is what useNavBottom (detail/DetailPanel.tsx) measures, so it must stay the first <nav> on the page.
    <nav aria-label="Main" className="relative z-40 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b bg-background/85 px-4 py-2 text-sm backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight text-foreground">
        <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <svg width="16" height="16" viewBox="0 0 28 28" fill="none" aria-hidden="true">
            <path d="M5 19l5-10 5 7 4-5 4 8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        Disaster Deck
      </Link>
      <span className="hidden rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground xl:inline">Exercise · 6 Feb 2023 earthquake</span>
      <div className={cn("no-scrollbar order-last flex w-full min-w-0 items-center gap-0.5 overflow-x-auto whitespace-nowrap xl:order-none xl:w-auto xl:flex-1", path.startsWith("/field") && "max-sm:hidden")}>
        {LINKS.map((l) => {
          const on = l.href === "/" ? path === "/" : path.startsWith(l.href);
          return (
            <Link key={l.href} href={l.href} aria-current={on ? "page" : undefined}
              className={cn("rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                on ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {l.label}
            </Link>
          );
        })}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2 xl:ml-0">
        <Suspense fallback={null}><ActingAs /></Suspense>
        <InboxBadge />
        {account}
        <StatusPill />
        <ThemeToggle />
      </div>
    </nav>
  );
}
