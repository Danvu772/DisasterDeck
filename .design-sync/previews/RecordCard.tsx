import { RecordCard } from "disaster-desk";

const now = Date.now();
const ago = (min: number) => new Date(now - min * 60000);
const col = { display: "grid", gap: 12, maxWidth: 360 } as const;

export const Tiers = () => (
  <div style={col}>
    <RecordCard type="site" title="Örnek St. 12" detail="1 person trapped. Call status: not called." tier={0} priority={54}
      confidence="corroborated" status="open" at={ago(14)} source="x" sources={4} now={now} />
    <RecordCard type="road" title="İnönü Ave, north" detail="Collapsed building on the road" tier={1}
      confidence="confirmed" status="closed" at={ago(22)} source="person" now={now} />
    <RecordCard type="need" title="40 hot meals" detail="Yeşilyurt" tier={2} priority={12}
      confidence="unconfirmed" status="proposed" at={ago(25)} source="person" now={now} />
  </div>
);
// Tier is the left bar: 0 red, 1 amber, 2 grey. Nothing else is red.

export const Confidence = () => (
  <div style={col}>
    <RecordCard type="site" title="Near the mosque, Kale" detail="0 people trapped. Call status: not called." tier={1} priority={31}
      confidence="unconfirmed" status="open" at={ago(20)} source="x" now={now} />
    <RecordCard type="site" title="Örnek St. 12" detail="1 person trapped. Call status: not called." tier={1} priority={54}
      confidence="corroborated" status="open" at={ago(14)} source="x" sources={4} now={now} />
    <RecordCard type="site" title="Çınar St. 3" detail="3 people trapped. Call status: verified." tier={1} priority={70}
      confidence="confirmed" status="team on site" at={ago(40)} source="person" now={now} />
  </div>
);
// Confidence is the border: dashed, thin solid, thick solid. Never colour.

export const Stale = () => (
  <div style={col}>
    <RecordCard type="shelter" title="Shelter A, school gym" tier={1} confidence="confirmed"
      status="58/60" at={ago(120)} source="instagram" now={now} />
  </div>
);
// Past the per-type threshold the stamp fades and says "stale". Shelters go stale after 30 min.

export const ActNowWithHistory = () => (
  <div style={col}>
    <RecordCard type="incident" title="vehicle breakdown" detail="Flat tire, I'm stuck at km 14, 30 blankets on board"
      tier={0} actNow confidence="confirmed" status="helping" at={ago(2)} source="person" now={now}
      history={[
        { ts: ago(14), by: "x-agent", source: "x", reason: "Opened from report" },
        { ts: ago(2), by: "Mehmet", source: "person", reason: "Relay to supplier-4" },
      ]} />
  </div>
);
// actNow overrides the tier bar to red (critical incident, overdue task). History is a drawer.
