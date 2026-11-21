// Shared USWDS building blocks for the field phone (D-0001). Pure presentational pieces:
// the card surface, the tier bar and the tier tag. Every colour is a USWDS token
// (bg-usa-*, text-usa-*) so the screen reads the same in light and dark.
import type { Tier } from "@/lib/types";
import { cn } from "@/lib/utils";
import { TIER_WORD } from "../detail/fields";

// One quiet card: white on light, the same look as the coordinator's card (components/coordinator/parts.tsx).
export const card = "rounded-md border border-usa-base-lighter bg-usa-white text-usa-ink";

// The thin tier bar. Tier 0 (or act-now) is the only red; tier 1 is a warning; the rest is calm grey.
export function tierBar(tier: Tier, actNow = false): string {
  if (actNow || tier === 0) return "bg-usa-error";
  if (tier === 1) return "bg-usa-warning";
  return "bg-usa-base";
}

// The tier word as a tag. Tier 0 (or act-now) is the only red.
export function TierTag({ tier, actNow }: { tier: Tier; actNow?: boolean }) {
  const red = actNow || tier === 0;
  return (
    <span
      className={cn(
        "usa-tag whitespace-nowrap",
        red ? "bg-usa-error-lighter text-usa-ink" : tier === 1 ? "bg-usa-warning text-usa-ink" : "bg-usa-base-lightest text-usa-ink",
      )}
    >
      {TIER_WORD[tier]}
    </span>
  );
}
