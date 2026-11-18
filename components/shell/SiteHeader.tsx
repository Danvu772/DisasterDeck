"use client";
// The USWDS header on every screen (D-0001): name, the six screens, the desk's tools.
// No ".gov" banner: Disaster Deck is not a government website.
// Below the desktop breakpoint the nav is the USWDS drawer behind the Menu button.
import { Header, NavMenuButton, PrimaryNav, Title } from "@trussworks/react-uswds";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { users } from "@/fixtures/desk";
import { InboxBadge } from "../InboxBadge";
import { StatusPill } from "../StatusPill";
import { ThemeToggle } from "../theme/theme";
import { isCurrent, SCREENS } from "./screens";

// ?user=<id> is who presses the buttons on Field and Coordinator (demo only).
function ActingAs() {
  const id = useSearchParams().get("user");
  if (!id) return null;
  const name = users.find((u) => u._id === id)?.name ?? id;
  return <span className="usa-tag hidden md:inline-block" title="Acting as (demo)">{name}</span>;
}

function Mark() {
  return (
    <span className="dd-mark" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 28 28" fill="none">
        <path d="M5 19l5-10 5 7 4-5 4 8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function SiteHeader({ account }: { account?: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  // A new page closes the drawer. Escape closes it too.
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // The redesign under /v2 draws its own header.
  if (path.startsWith("/v2")) return null;

  const items = SCREENS.map((s) => {
    const on = isCurrent(s.href, path);
    return (
      <Link key={s.href} href={s.href} className={`usa-nav-link${on ? " usa-current" : ""}`} aria-current={on ? "page" : undefined}>
        <span>{s.label}</span>
      </Link>
    );
  });

  return (
    <Header basic showMobileOverlay={open} className="dd-shell-header">
      <div className="usa-nav-container">
        <div className="usa-navbar">
          <Title>
            <Link href="/" title="Disaster Deck, the desk">
              <Mark />
              Disaster Deck
            </Link>
          </Title>
          <NavMenuButton label="Menu" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="dd-primary-nav" />
        </div>
        <PrimaryNav id="dd-primary-nav" aria-label="Primary" items={items} mobileExpanded={open} onToggleMobileNav={() => setOpen(false)} />
        <div className="dd-shell-tools">
          <span className="usa-tag dd-exercise-tag hidden xl:inline-block">Exercise · 6 Feb 2023 earthquake</span>
          <Suspense fallback={null}><ActingAs /></Suspense>
          <InboxBadge />
          {account}
          <StatusPill />
          <ThemeToggle />
        </div>
      </div>
    </Header>
  );
}
