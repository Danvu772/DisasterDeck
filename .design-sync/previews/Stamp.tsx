import { Stamp } from "disaster-deck";

const now = Date.now();
const ago = (min: number) => new Date(now - min * 60000);
const row = { display: "grid", gap: 6 } as const;

export const Sources = () => (
  <div style={row}>
    <Stamp type="shelter" source="instagram" at={ago(4)} now={now} />
    <Stamp type="site" source="x" sources={4} at={ago(14)} now={now} />
    <Stamp type="zone" source="nasa" at={ago(300)} now={now} />
    <Stamp type="need" source="person" at={ago(0)} now={now} />
  </div>
);
// Source word + age, mono. Several sources collapse to a count.

export const Stale = () => (
  <div style={row}>
    <Stamp type="road" source="person" at={ago(48)} now={now} />
    <Stamp type="incident" source="person" at={ago(20)} now={now} />
    <Stamp type="shelter" source="instagram" at={ago(120)} now={now} />
  </div>
);
// Past the per-type threshold (road 30 min, incident 15 min) the ink fades and says STALE.
