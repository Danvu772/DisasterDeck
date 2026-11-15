"use client";
// The stream behind /ops. Live: research-agent events from GET /api/events. Until the desk has
// at least a handful of them, the exercise posts replay on a timer and the screen says so.
import { useEffect, useMemo, useState } from "react";
import type { Event } from "@/lib/types";
import { makeOpsPosts } from "@/fixtures/opsPosts";
import { usePolled } from "../map/usePolled";
import { fromEvents } from "./opsModel";

const FIRST = 14;      // posts already on screen when the replay opens
const STEP_MS = 1600;  // one new post every 1.6 s at 1x
const LIVE_MIN = 5;    // fewer live posts than this and the replay is the better demo

export function useOpsFeed() {
  const fixture = useMemo(() => makeOpsPosts(), []);
  const { data, live } = usePolled<Event[]>("/api/events?limit=500", [], 3000);
  const livePosts = useMemo(() => (Array.isArray(data) ? fromEvents(data) : []), [data]);
  const isLive = live && livePosts.length >= LIVE_MIN;

  const [shown, setShown] = useState(FIRST);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  useEffect(() => {
    if (isLive || !playing) return;
    const t = setInterval(() => setShown((n) => Math.min(fixture.length, n + 1)), STEP_MS / speed);
    return () => clearInterval(t);
  }, [isLive, playing, speed, fixture.length]);

  return {
    posts: isLive ? livePosts : fixture.slice(0, shown),
    total: isLive ? livePosts.length : fixture.length,
    isLive,
    playing, setPlaying, speed, setSpeed,
    restart: () => { setShown(FIRST); setPlaying(true); },
    done: !isLive && shown >= fixture.length,
  };
}
