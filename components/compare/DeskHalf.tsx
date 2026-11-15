import { PhoneCall, UserRound } from "lucide-react";
import type { Site } from "@/lib/types";
import { SiteCards } from "@/components/BoardCards";

// What the desk makes of the same tweets: merged sites, with an owner line under each card.
export function DeskHalf({ items, now }: { items: { site: Site; owner: string }[]; now: number }) {
  return (
    <div className="space-y-4">
      {items.map(({ site, owner }) => {
        const owned = site.callStatus !== "not_called";
        return (
          <div key={site._id} className="space-y-2">
            <SiteCards items={[site]} now={now} />
            <p className={`flex items-center gap-2 px-1 text-xs ${owned ? "font-medium text-foreground" : "text-muted-foreground"}`}>
              {owned ? <PhoneCall aria-hidden className="size-3.5" /> : <UserRound aria-hidden className="size-3.5" />}
              {owner}
            </p>
          </div>
        );
      })}
    </div>
  );
}
