"use client";
// v2 shared board: situation tiles, one priority list, the map, the desk feed and the selected record.
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Tier } from "@/lib/types";
import { detailFor, feedLine, nameOf, rowsFromBoard, situation, type FeedEvent, type RecordKind, type V2Board } from "./boardModel";
import type { MapDot } from "./V2MapView";
import { ago, Chip, clock, DemoLine, TierBadge, TIER_NAME, TopBar } from "./ui";
import { useDesk } from "./useDesk";

const V2MapView = dynamic(() => import("./V2MapView"), {
  ssr: false,
  loading: () => <p className="p-4 text-sm muted">Loading the map</p>,
});

type Filter = "all" | "site" | "need" | "incident" | "place";
const FILTERS: { id: Filter; label: string; kinds: RecordKind[] }[] = [
  { id: "all", label: "All", kinds: ["site", "need", "incident", "shelter", "road"] },
  { id: "site", label: "Sites", kinds: ["site"] },
  { id: "need", label: "Needs", kinds: ["need"] },
  { id: "incident", label: "Problems", kinds: ["incident"] },
  { id: "place", label: "Shelters and roads", kinds: ["shelter", "road"] },
];

export function BoardV2({ initial, initialFeed }: { initial: V2Board; initialFeed: FeedEvent[] }) {
  const { data: b, live, now, demo } = useDesk<V2Board>("/api/board", initial);
  const { data: feed } = useDesk<FeedEvent[]>("/api/events?limit=6", initialFeed, 2000);
  const [filter, setFilter] = useState<Filter>("all");
  const [picked, setPicked] = useState<string | null>(null);

  const rows = useMemo(() => rowsFromBoard(b, now), [b, now]);
  const shown = rows.filter((r) => FILTERS.find((f) => f.id === filter)!.kinds.includes(r.kind));
  const selectedKey = picked && rows.some((r) => r.key === picked) ? picked : rows[0]?.key ?? null;
  const detail = selectedKey ? detailFor(b, selectedKey, now) : null;
  const sit = situation(b, now);

  const dots: MapDot[] = useMemo(() => {
    const tierOf = new Map(rows.map((r) => [r.key, r.tier] as const));
    const out: MapDot[] = [];
    for (const s of b.sites) if (s.coords) out.push({ key: `site:${s._id}`, coords: s.coords, tier: tierOf.get(`site:${s._id}`) ?? s.tier, kind: "site", title: s.address });
    for (const i of b.incidents) if (i.coords && i.status !== "resolved") out.push({ key: `incident:${i._id}`, coords: i.coords, tier: 0, kind: "incident", title: i.textEn });
    for (const h of b.shelters) if (h.coords) out.push({ key: `shelter:${h._id}`, coords: h.coords, tier: 1, kind: "shelter", title: `${h.name}, ${h.bedsUsed} of ${h.bedsTotal}` });
    for (const r of b.roads) if (r.coords && r.state !== "open") out.push({ key: `road:${r._id}`, coords: r.coords, tier: 1, kind: "road", title: r.road });
    return out;
  }, [b, rows]);

  const counts = (kinds: RecordKind[]) => rows.filter((r) => kinds.includes(r.kind)).length;
  const latest = [...feed].reverse().slice(0, 6);

  return (
    <>
      <TopBar health={b.health} live={live} demo={demo} approvals={sit.approvals} />
      <DemoLine live={live} demo={demo} />

      <section aria-label="Situation" className="grid grid-cols-2 gap-3 px-6 pt-4 lg:grid-cols-4">
        <Tile label="Trapped, no team yet" tone="act"
          big={`${sit.noTeam.count} ${sit.noTeam.count === 1 ? "site" : "sites"}`}
          small={sit.noTeam.count ? `${sit.noTeam.people || "unknown"} people, first ${sit.noTeam.first}` : "Every tier 0 site has a team"} />
        <Tile label="Waiting for a decision" big={String(sit.approvals)}
          small={<Link href="/v2/coordinator">Open the coordinator screen</Link>} />
        <Tile label="Shelter beds free" big={String(sit.bedsFree)}
          small={`in ${sit.shelters} shelters, oldest count ${ago(new Date(now - sit.oldestShelter * 60000), now)} old`} />
        <Tile label="Coldest night" big={sit.coldest === null ? "No data" : `${sit.coldest.toFixed(1)} °C`}
          small={sit.coldest === null ? "No temperature on the zones yet" : "NASA POWER, about 50 km grid"} />
      </section>

      <main className="flex flex-1 flex-wrap items-stretch gap-4 px-6 py-4">
        <section aria-label="Shared priority list" className="card flex min-w-0 max-w-[460px] flex-[1_1_380px] flex-col overflow-hidden">
          <div className="border-b px-4 pb-2.5 pt-4" style={{ borderColor: "var(--v2-line-2)" }}>
            <div className="flex items-baseline justify-between gap-2">
              <h1 className="text-[17px] font-bold">Shared priority list</h1>
              <span className="text-xs muted">tier first, then score</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter">
              {FILTERS.map((f) => (
                <button key={f.id} onClick={() => setFilter(f.id)} aria-pressed={filter === f.id}
                  className={`btn-choice min-h-[34px] rounded-full px-3 text-[13px] font-semibold`}>
                  {f.label} {counts(f.kinds)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex max-h-[720px] flex-col overflow-y-auto">
            {shown.length === 0 && <p className="p-4 text-sm muted">Nothing here right now.</p>}
            {shown.map((r) => (
              <button key={r.key} className="row grid grid-cols-[46px_minmax(0,1fr)_auto] items-start gap-3 px-4 py-3"
                aria-pressed={r.key === selectedKey} onClick={() => setPicked(r.key)}>
                <TierBadge tier={r.tier} />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="eyebrow">{r.kind === "incident" ? "Problem" : r.kind} <span className="mono normal-case tracking-normal">{r.id}</span></span>
                  <span className="text-[15px] font-semibold">{r.title}</span>
                  <span className="text-[13px] muted">{r.meta}</span>
                  <span className="mt-1"><Chip kind={r.chip.kind}>{r.chip.text}</Chip></span>
                </span>
                <span className="flex flex-col items-end">
                  <span className="mono text-[15px] font-semibold">{r.score ?? ""}</span>
                  <span className="text-[11px] faint">{r.score === null ? "" : "score"}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section aria-label="Map and desk feed" className="flex min-w-0 flex-[999_1_420px] flex-col gap-4">
          <div className="map-frame relative min-h-[460px] flex-1">
            <V2MapView dots={dots} selected={selectedKey ?? undefined} onPick={setPicked} />
            <div className="card pointer-events-none absolute bottom-3 left-3 z-[400] flex max-w-[300px] flex-col gap-1.5 px-3 py-2.5 text-xs">
              <span className="font-bold">Legend</span>
              <span className="flex items-center gap-2"><span className="bg-act inline-block h-2.5 w-2.5 rounded-full" />Tier 0, danger to life</span>
              <span className="flex items-center gap-2"><span className="bg-urgent inline-block h-2.5 w-2.5 rounded-full" />Tier 1, urgent</span>
              <span className="flex items-center gap-2"><span className="bg-primary inline-block h-2.5 w-2.5 rounded-full" />Shelter</span>
              <span className="muted">Click a dot to open it on the right.</span>
            </div>
          </div>

          <div className="card px-4 py-3.5">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h2 className="text-[15px] font-bold">Desk feed</h2>
              <span className="text-xs muted">every event, newest first</span>
            </div>
            {latest.length === 0 && <p className="text-sm muted">No events yet.</p>}
            <ul className="flex flex-col gap-1.5">
              {latest.map((e, i) => (
                <li key={e._id ?? i} className="grid grid-cols-[52px_150px_minmax(0,1fr)] items-baseline gap-2.5 text-[13px]">
                  <span className="mono faint">{clock(e.ts)}</span>
                  <span className="truncate font-semibold" style={{ color: "var(--v2-ink-2)" }}>{nameOf(e.actor)}</span>
                  <span className="min-w-0 truncate">{feedLine(e)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <aside aria-label="Selected record" className="card flex min-w-0 max-w-[420px] flex-[1_1_340px] flex-col gap-4 p-[18px]">
          {!detail && <p className="text-sm muted">Pick something on the list or the map.</p>}
          {detail && (
            <>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <TierBadge tier={detail.tier as Tier} long />
                  <span className="mono text-xs muted">{detail.kindLabel} {detail.id}</span>
                </div>
                <h2 className="text-[22px] font-bold tracking-tight">{detail.title}</h2>
                <p className="text-sm" style={{ color: "var(--v2-ink-2)" }}>{detail.summary}</p>
              </div>

              <div className="panel-soft p-3">
                <div className="flex justify-between text-[13px] font-semibold">
                  <span>How sure the desk is</span>
                  <span className={`fg-${detail.conf.tone}`}>{detail.conf.label}</span>
                </div>
                <div className="meter mt-2"><span className={`bg-${detail.conf.tone}`} style={{ width: `${detail.conf.pct}%` }} /></div>
                <p className="mt-1.5 text-xs muted">{detail.conf.note}</p>
              </div>

              <div className="why p-3">
                <div className="eyebrow">Why it is here</div>
                <p className="mt-1.5 text-sm leading-relaxed">{detail.why}</p>
              </div>

              <dl className="grid grid-cols-2 gap-2">
                {detail.facts.map((f) => (
                  <div key={f.label} className="panel-soft px-3 py-2">
                    <dt className="text-xs muted">{f.label}</dt>
                    <dd className="text-sm font-semibold first-letter:uppercase">{f.value}</dd>
                  </div>
                ))}
              </dl>

              <div>
                <h3 className="eyebrow mb-2">History</h3>
                {detail.history.length === 0 && <p className="text-sm muted">Nothing recorded yet.</p>}
                <ol className="flex flex-col gap-2.5">
                  {detail.history.slice(0, 6).map((h, i) => (
                    <li key={i} className="grid grid-cols-[48px_minmax(0,1fr)] gap-2.5 text-[13px]">
                      <span className="mono faint">{clock(h.when)}</span>
                      <span><span className="font-semibold">{h.who}</span> <span style={{ color: "var(--v2-ink-2)" }}>{h.what}</span></span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="mt-auto flex flex-wrap gap-2">
                <Link href={`/?open=${encodeURIComponent(detail.key)}`}
                  className="btn btn-ghost inline-flex flex-1 items-center justify-center no-underline">Open in the full record view</Link>
              </div>
              <p className="text-xs faint">{TIER_NAME[detail.tier as Tier]} first, then score. A coordinator can pin or push down anything, with a reason.</p>
            </>
          )}
        </aside>
      </main>
    </>
  );
}

function Tile({ label, big, small, tone }: { label: string; big: string; small: React.ReactNode; tone?: "act" }) {
  return (
    <div className="card px-4 py-3.5">
      <div className={`eyebrow ${tone === "act" ? "fg-act" : ""}`}>{label}</div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
        <span className="text-[28px] font-bold leading-none">{big}</span>
        <span className="text-[13px] muted">{small}</span>
      </div>
    </div>
  );
}
