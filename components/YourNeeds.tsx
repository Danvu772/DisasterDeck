import type { Need } from "@/lib/types";
import { ageText, confidenceBorder, statusTag, statusText, tierBar } from "./encode";

// Need.requestedBy is in the contract (lib/types.ts v2.1), so a need is its own type here.
export type MyNeed = Need;

// The needs this person filed, sorted by the same tier and score as the shared list.
// Each row: what they asked for, where it stands, and the latest thing the desk did about it.
export function YourNeeds({ needs, now }: { needs: MyNeed[]; now: number }) {
  if (needs.length === 0) return <p className="text-sm text-muted">Nothing asked for yet. Tell your agent what you need.</p>;
  return (
    <ul className="space-y-2">
      {needs.map((n) => {
        const last = n.history[n.history.length - 1];
        return (
          <li key={n._id} className={`flex overflow-hidden rounded-card bg-card ${confidenceBorder(n.confidence)}`}>
            <div className={`w-1 shrink-0 ${tierBar(n.tier, n.lifeThreatening && n.status !== "delivered")}`} />
            <div className="min-w-0 flex-1 px-3 py-2">
              <p className="flex items-baseline gap-2 text-sm">
                <span className="font-bold">{n.quantity} {n.item}</span>
                <span className={statusTag}>{statusText(n.status)}</span>
                <span className="ml-auto whitespace-nowrap text-xs text-muted">Priority <span className="font-mono">{n.priority}</span></span>
              </p>
              {n.status === "proposed" && (
                <p className="mt-0.5 text-xs text-muted">
                  {n.support} of 3 requests. Goes on the shared list at 3.
                </p>
              )}
              {last && (
                <p className="mt-0.5 truncate text-xs">
                  <span className="text-muted">{ageText(last.ts, now)}:</span> {last.reason}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
