// Shared USWDS building blocks for the coordinator screen (D-0001). Pure presentational pieces:
// the card surface, the tier tag and the record-kind glyph. Every colour is a USWDS token
// (bg-usa-*, text-usa-*) so the screen reads the same in light and dark.
import type { RecordType, Tier } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ClipboardList, MapPin, Package, TriangleAlert, type LucideIcon } from "lucide-react";
import { TIER_WORD } from "../detail/fields";

// One quiet card: white on light, the same look as the login card (app/uswds.scss .dd-login__card).
export const card = "rounded-md border border-usa-base-lighter bg-usa-white text-usa-ink";

// Tier 0 (or act-now) is the only red; tier 1 is a warning; the rest is calm grey.
export function TierTag({ tier, actNow }: { tier: Tier; actNow?: boolean }) {
  const red = actNow || tier === 0;
  return (
    <span
      className={cn(
        "usa-tag whitespace-nowrap",
        red ? "bg-usa-error-lighter text-usa-ink" : tier === 1 ? "bg-usa-warning text-usa-ink" : "bg-usa-base-lightest text-usa-ink",
      )}
    >
      <span aria-hidden className={cn("mr-1 inline-block size-1.5 rounded-full align-middle", red ? "bg-usa-error" : tier === 1 ? "bg-usa-base-darkest" : "bg-usa-base")} />
      {TIER_WORD[tier]}
    </span>
  );
}

// The record kind as a soft icon tile, tinted by how bad it is. Interface glyphs stay on Lucide.
export function KindGlyph({ kind, tier, actNow }: { kind: RecordType | "task"; tier: Tier; actNow?: boolean }) {
  const Icon: LucideIcon = kind === "site" ? MapPin : kind === "need" ? Package : kind === "incident" ? TriangleAlert : ClipboardList;
  const red = actNow || tier === 0;
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-md",
        red ? "bg-usa-error-lighter text-usa-ink" : tier === 1 ? "bg-usa-warning text-usa-ink" : "bg-usa-base-lightest text-usa-base-dark",
      )}
    >
      <Icon className="size-4" />
    </span>
  );
}