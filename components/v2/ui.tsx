"use client";
// Small pieces every v2 screen shares: the top bar, tier badges, chips and ages.
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Health, Tier } from "@/lib/types";

const TABS = [
  { href: "/v2", label: "Board" },
  { href: "/v2/coordinator", label: "Coordinator" },
  { href: "/v2/volunteer", label: "Volunteer" },
  { href: "/v2/field", label: "Field phone" },
];

export function TopBar({ health, live, approvals, who, demo }: {
  health?: Partial<Health>; live: boolean; approvals?: number; who?: string; demo?: boolean;
}) {
  const path = usePathname();
  const pending = health?.pending ?? 0;
  const oldest = health?.oldestPendingSeconds ?? 0;
  const loopAge = health?.lastLoopAt ? (Date.now() - new Date(health.lastLoopAt).getTime()) / 1000 : Infinity;
  const brainUp = loopAge < 30;
  const bad = !demo && (!live || oldest > 30 || (health?.failed ?? 0) > 0);
  const waitText = oldest >= 120 ? `${Math.round(oldest / 60)} min` : `${oldest} s`;
  const healthText = demo
    ? "Demo desk, fixture data"
    : !live
      ? "The desk is not answering"
      : `${brainUp ? "Brain running" : "Brain not running"}, queue ${pending}${pending ? `, oldest ${waitText}` : ""}${health?.failed ? `, ${health.failed} failed` : ""}`;
  return (
    <header className="topbar flex flex-wrap items-center gap-4 px-6 py-3">
      <div className="flex items-center gap-2.5">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
          <rect x="1" y="1" width="26" height="26" rx="7" stroke="currentColor" strokeOpacity=".9" strokeWidth="2" />
          <path d="M8 18l4-8 4 6 3-4 2 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-base font-bold tracking-tight">Disaster Desk</span>
        <span className="pill rounded-full px-2 py-1 text-xs">Antakya exercise, synthetic data</span>
      </div>
      <nav aria-label="Screens" className="flex flex-wrap gap-1">
        {TABS.map((t) => {
          const on = t.href === "/v2" ? path === "/v2" : path.startsWith(t.href);
          return (
            <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined}
              className="tab rounded-lg px-3.5 py-2 text-sm font-semibold">
              {t.label}
              {t.href === "/v2/coordinator" && approvals ? (
                <span className="count-badge mono ml-1.5 rounded-full px-1.5 text-[11px]">{approvals}</span>
              ) : null}
            </Link>
          );
        })}
        <Link href="/" className="tab rounded-lg px-3.5 py-2 text-sm">Old screens</Link>
      </nav>
      <div className="flex-1" />
      <div className="flex flex-wrap items-center gap-3 text-[13px]">
        {who && <span className="pill rounded-full px-3 py-1">{who}</span>}
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${bad ? "health-bad" : "health-ok"}`}>
          <span className={`inline-block h-2 w-2 rounded-full ${bad ? "dot-bad" : "dot-ok"}`} aria-hidden="true" />
          {healthText}
        </span>
      </div>
    </header>
  );
}

export const TIER_NAME: Record<Tier, string> = { 0: "Danger to life", 1: "Urgent", 2: "Comfort" };

export function TierBadge({ tier, long }: { tier: Tier; long?: boolean }) {
  return (
    <span className={`tier tier-${tier} mono inline-block px-2 py-0.5 text-center text-xs`}>
      T{tier}{long ? ` ${TIER_NAME[tier]}` : ""}
    </span>
  );
}

export type ChipKind = "act" | "call" | "move" | "ok" | "grey";
export function Chip({ kind, children }: { kind: ChipKind; children: React.ReactNode }) {
  return <span className={`chip chip-${kind} inline-flex self-start px-2 py-0.5 text-xs`}>{children}</span>;
}

/** "4 min", "2 h", "3 d", from a date to now. */
export function ago(when: Date | string | null | undefined, now: number): string {
  if (!when) return "unknown age";
  const min = Math.max(0, Math.round((now - new Date(when).getTime()) / 60000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} d`;
}

/** "06:42", local time. */
export function clock(when: Date | string | null | undefined): string {
  if (!when) return "";
  const d = new Date(when);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function DemoLine({ live, demo }: { live: boolean; demo?: boolean }) {
  if (live && !demo) return null;
  return (
    <p className="px-6 pt-2 text-sm muted">
      {demo ? "Demo desk: made-up fixture data, nothing here is live. Remove ?demo=1 from the address for the live desk."
        : "The board API is not answering, so this screen shows the fixture desk."}
    </p>
  );
}
