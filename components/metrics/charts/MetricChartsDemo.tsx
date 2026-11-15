"use client";
// /lab only: hand-written samples, one per chart kind plus one unknown. "Change the numbers"
// swaps in the second set. Only the values marked "changed" differ, so only those should move.
import { useState } from "react";
import { button } from "../../encode";
import type { MetricResult } from "../types";
import { MetricCard } from "./MetricCard";

const NOW = 0;

function samples(b: boolean): MetricResult[] {
  return [
    {
      id: "shelters", title: "Shelter beds in use", headline: b ? "Shelter A is full." : "Shelter A has 2 free beds.",
      status: b ? "act" : "warn", computedAt: NOW,
      chart: { kind: "bars", unit: "beds", points: [
        { label: "Shelter A", value: b ? 60 : 58, max: 60, tone: b ? "act" : "warn", note: "IG, 2 h ago", recordKey: "shelter:shelter-a" }, // changed
        { label: "Shelter B", value: 31, max: 80, tone: "ok", recordKey: "shelter:shelter-b" },
        { label: "Shelter C", value: 12, max: 40, tone: "ok" },
      ] },
      basis: "3 shelters reported in the last 2 h", source: { name: "FEMA ESF#6", url: "https://www.fema.gov/pdf/emergency/nrf/nrf-esf-06.pdf" },
    },
    {
      id: "logistics", title: "Delivery time by team", headline: "Team A takes the longest, 42 minutes.",
      status: "ok", computedAt: NOW,
      chart: { kind: "bars", unit: "min", points: [
        { label: "Team A", value: b ? 30 : 42, tone: "primary" }, // changed
        { label: "Team B", value: 18 },
        { label: "Team C", value: 24.5, tone: "calm" },
      ] },
      basis: "9 deliveries so far", source: { name: "Beamon and Balcik 2008", url: "https://doi.org/10.1108/09513550810846087" },
    },
    {
      id: "coverage", title: "Open sites with a free unit in reach", headline: b ? "9 of 12 open sites are covered." : "7 of 12 open sites are covered.",
      status: b ? "ok" : "warn", computedAt: NOW,
      chart: { kind: "gauge", unit: "sites", point: { label: "Covered sites", value: b ? 9 : 7, max: 12, tone: b ? "ok" : "warn", note: "within 15 min" } },
      basis: "12 open sites, 5 free units", source: { name: "Church and ReVelle 1974", url: "https://doi.org/10.1007/BF01942293" },
    },
    {
      id: "credibility", title: "Source reliability by information credibility", headline: "Most reports are B2, usually reliable and probably true.",
      status: "ok", computedAt: NOW,
      chart: { kind: "matrix", rows: ["A", "B", "C", "D", "E", "F"], cols: ["1", "2", "3", "4", "5", "6"],
        rowTitle: "Source reliability", colTitle: "Information credibility",
        cells: [
          [b ? 4 : 2, 1, 0, 0, 0, 0],
          [3, b ? 9 : 6, 2, 0, 0, 0],
          [1, 3, b ? 3 : 5, 1, 0, 0],
          [0, 1, 2, 1, 0, 0],
          [0, 0, 0, 0, 0, 0],
          [0, 0, 1, 0, 0, 2],
        ] },
      basis: "31 reports on the board", source: { name: "Admiralty code, NATO STANAG 2511", url: "https://en.wikipedia.org/wiki/Admiralty_code" },
    },
    {
      id: "ics209", title: "Incident status snapshot", headline: b ? "3 critical sites, 1 road closed." : "2 critical sites, 1 road closed.",
      status: "act", computedAt: NOW,
      chart: { kind: "snapshot", rows: [
        { label: "Critical sites", value: b ? "3" : "2", tone: "act" }, // changed
        { label: "Roads closed", value: "1", tone: "warn" },
        { label: "Teams on site", value: "4 of 6", tone: "ok" },
        { label: "Shelter beds free", value: b ? "0" : "2" },
      ] },
      basis: "board at the scenario clock", source: { name: "FEMA ICS-209", url: "https://training.fema.gov/emiweb/is/icsresource/assets/ics%20forms/ics%20form%20209,%20incident%20status%20summary%20(v3).pdf" },
    },
    {
      id: "lifelines", title: "Road status with evidence", headline: "Unknown. No road report has a photo yet.",
      status: "unknown", computedAt: NOW, chart: { kind: "none" },
      unknownReason: "No road record carries evidence. The field team owns adding photos.",
      basis: "0 of 6 road records have evidence", source: { name: "FEMA Community Lifelines", url: "https://www.fema.gov/emergency-managers/practitioners/lifelines" },
    },
  ];
}

export function MetricChartsDemo() {
  const [second, setSecond] = useState(false);
  return (
    <div>
      <button type="button" className={button.primary} onClick={() => setSecond((s) => !s)}>Change the numbers</button>
      <div className="mt-3 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {samples(second).map((r) => <MetricCard key={r.id} result={r} />)}
      </div>
    </div>
  );
}
