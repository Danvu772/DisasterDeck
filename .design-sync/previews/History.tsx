import { History } from "disaster-desk";
import { makeBoard } from "@/fixtures/board";

const now = Date.now();
const b = makeBoard(now);
const site = b.sites[0];
const need = b.needs[0];

export const Collapsed = () => <div style={{ maxWidth: 380 }}><History entries={site.history} now={now} /></div>;
// Collapsed drawer as it sits under a card. Opened below: machine lines mono, people sans.

export const Open = () => {
  const ref = (el: HTMLDivElement | null) => el?.querySelector("details")?.setAttribute("open", "");
  return (
    <div ref={ref} style={{ maxWidth: 380 }}>
      <History entries={[...site.history, ...need.history]} now={now} />
    </div>
  );
};
