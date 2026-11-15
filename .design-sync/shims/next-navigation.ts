// Sync-only stand-in for next/navigation: no router outside Next, so the path is home.
export function usePathname(): string { return "/"; }
