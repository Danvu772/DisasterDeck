"use client";
// The landing board. Polls /api/board every second, starts from the fixture the page passes in.
// 1280 px and up: list | map with the desk feed under it | detail, no page scroll.
// md to 1280: the map on top, list and detail side by side under it, the feed last.
// Phone: the list, and the detail as a full-screen sheet while ?open= is set.
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { makeBoard } from "@/fixtures/board";
import { AskDesk } from "./AskDesk";
import { BoardList, FilterChips } from "./board/BoardList";
import { DeskFeed, type FeedEvent } from "./board/DeskFeed";
import { PeopleStrip } from "./board/PeopleStrip";
import { FILTER_OF, type Filter, firstActNow } from "./board/rows";
import { DetailPanel } from "./detail/DetailPanel";
import { findRecord, locate, parseKey } from "./detail/locate";
import { fromBoard } from "./map/mapItems";
import { usePolled } from "./map/usePolled";
import { Loading } from "@/components/ui";

const BoardMap = dynamic(() => import("./board/BoardMap"), {
  ssr: false,
  loading: () => <Loading label="Loading the map" />,
});

// The API board has every field of the fixture board (plus zones and fuller health), so one type fits both.
type DeskBoard = ReturnType<typeof makeBoard>;

const wide = () => window.matchMedia("(min-width: 1280px)").matches;
const phone = () => !window.matchMedia("(min-width: 768px)").matches;

export function LiveBoard({ initial, initialFeed, initialLive = false }: {
  initial: DeskBoard; initialFeed: FeedEvent[]; initialLive?: boolean;
}) {
  const { data: b, live, now } = usePolled<DeskBoard>("/api/board", initial, 1000, initialLive);

  // ?open=<kind>:<id> is the selection (t21), so a link opens the same record.
  // With nothing open, the detail column shows the first act-now record. That pick does not
  // fly the map and does not open the phone sheet.
  const openKey = useSearchParams().get("open");
  const selected = openKey ?? firstActNow(b, now);
  const [filter, setFilter] = useState<Filter>("all");

  const setOpen = useCallback((key: string | null) => {
    const url = new URL(window.location.href);
    if (key) url.searchParams.set("open", key);
    else url.searchParams.delete("open");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, []);
  // Picking a record the current chip hides switches to that record's chip. All shows everything.
  const open = useCallback((key: string) => {
    const kind = parseKey(key)?.kind;
    if (kind) setFilter((f) => (f === "all" ? f : FILTER_OF[kind]));
    setOpen(key);
  }, [setOpen]);
  const close = useCallback(() => {
    const back = openKey;
    setOpen(null);
    if (back) document.querySelector<HTMLElement>(`[data-card="${CSS.escape(back)}"]`)?.focus();
  }, [openKey, setOpen]);

  // Phone sheet: focus moves in, Escape closes.
  const sheet = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!openKey || !phone()) return;
    sheet.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openKey, close]);

  // A pick on the map or the feed brings its row into view in the list (1280 px and up, where the list scrolls on its own).
  useEffect(() => {
    if (!openKey || !wide()) return;
    document.querySelector(`[data-card="${CSS.escape(openKey)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [openKey, filter]);

  const mapItems = useMemo(() => fromBoard(b, { showClosed: true }), [b]);
  const ref = parseKey(selected);
  const record = ref ? findRecord(b, ref.kind, ref.id) : undefined;
  const loc = ref && record ? locate(ref.kind, record, b) : null;

  const card = "min-h-0 min-w-0 rounded-card border border-line bg-card";

  return (
    <main className="grid gap-4 p-4 md:grid-cols-2 xl:h-full xl:grid-cols-[380px_minmax(0,1fr)_400px] xl:grid-rows-[minmax(0,1fr)_14rem]">
      <section aria-label="Shared priority list"
        className={`${card} flex flex-col md:col-start-1 md:row-start-2 md:max-h-[80vh] xl:row-span-2 xl:row-start-1 xl:max-h-none`}>
        <div className="flex shrink-0 flex-col gap-3 border-b border-line p-3">
          <PeopleStrip board={b} />
          {/* AskDesk carries its own top margin for the old stacked page. The gap does that job here. */}
          <div className="[&>section]:mt-0 [&>section>div:empty]:hidden"><AskDesk /></div>
          {!live && <p className="text-sm text-muted">Demo data, the board API is not answering.</p>}
          <FilterChips board={b} filter={filter} onFilter={setFilter} />
        </div>
        <div className="min-h-0 flex-1 md:overflow-y-auto">
          <BoardList board={b} now={now} filter={filter} selected={selected} onOpen={open} />
        </div>
      </section>

      <div className={`${card} relative hidden overflow-hidden md:col-span-2 md:row-start-1 md:block md:h-[45vh] xl:col-span-1 xl:col-start-2 xl:row-start-1 xl:h-auto`}>
        <BoardMap items={mapItems} now={now} ring={loc?.key} ringAt={loc?.coords} fly={openKey ?? undefined} onPick={open} />
      </div>

      <div className="flex h-80 min-h-0 flex-col md:col-span-2 md:row-start-3 xl:col-span-1 xl:col-start-2 xl:row-start-2 xl:h-auto">
        <DeskFeed board={b} now={now} onOpen={open} initial={initialFeed} initialLive={initialLive} />
      </div>

      <aside ref={sheet} tabIndex={-1} aria-label="Selected record"
        className={`${openKey ? "fixed inset-0 z-[1100] flex" : "hidden"} min-h-0 min-w-0 flex-col bg-card md:static md:z-auto md:col-start-2 md:row-start-2 md:flex md:max-h-[80vh] md:rounded-card md:border md:border-line xl:col-start-3 xl:row-span-2 xl:row-start-1 xl:max-h-none`}>
        {selected
          ? <DetailPanel board={b} now={now} live={live} openKey={selected} onOpen={open} onClose={close} />
          : <p className="p-4 text-sm text-muted">Pick a record on the list or the map.</p>}
      </aside>
    </main>
  );
}
