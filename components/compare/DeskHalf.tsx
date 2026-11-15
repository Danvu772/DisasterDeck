import type { Site } from "@/lib/types";
import { SiteCards } from "@/components/BoardCards";

// What the desk makes of the same tweets: merged sites, with an owner line under each card.
export function DeskHalf({ items, now }: { items: { site: Site; owner: string }[]; now: number }) {
  return (
    <div className="space-y-3">
      {items.map(({ site, owner }) => (
        <div key={site._id}>
          <SiteCards items={[site]} now={now} />
          <p className="mt-1 text-sm"><span className="font-bold">Owner:</span> {owner}</p>
        </div>
      ))}
    </div>
  );
}
