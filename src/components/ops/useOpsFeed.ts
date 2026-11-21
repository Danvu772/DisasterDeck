"use client";
// The stream behind /ops. Live: research-agent events from GET /api/events. Until the desk has
// at least a handful of them, the exercise posts replay on a timer and the screen says so.
// Both feeds arrive one post at a time, so the list on the left grows from the top like a feed:
// the replay adds a post every 1.6 s; live, the newest few are held back at first and every post a
// poll brings joins in turn, a little under a second apart.
import { useEffect, useMemo, useState } from "react";
import type { Event } from "@/lib/types";
import { makeOpsPosts } from "@/fixtures/opsPosts";
import { usePolled } from "../map/usePolled";
import { fromEvents } from "./opsModel";

const FIRST = 14;          // replay: posts already on screen when it opens
const STEP_MS = 1600;      // replay: one new post every 1.6 s at 1x
const LIVE_MIN = 5;        // fewer live posts than this and the replay is the better demo
const LIVE_HELD = 8;       // live: the newest posts that still arrive one by one after the page opens
const LIVE_STEP_MS = 900;  // live: time between two posts joining the list

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

  // Live: the ids already on screen. null until the first live answer; then everything but the
  // newest LIVE_HELD, which (with anything later polls bring) join one at a time, oldest first.
  const [onScreen, setOnScreen] = useState<Set<string> | null>(null);
  const next = onScreen ? livePosts.find((p) => !onScreen.has(p.id)) : undefined;
  useEffect(() => {
    if (!isLive) return;
    if (!onScreen) {
      const t = setTimeout(() => setOnScreen(new Set(livePosts.slice(0, Math.max(0, livePosts.length - LIVE_HELD)).map((p) => p.id))), 0);
      return () => clearTimeout(t);
    }
    if (!next || !playing) return;
    const t = setTimeout(() => setOnScreen((s) => new Set(s).add(next.id)), LIVE_STEP_MS / speed);
    return () => clearTimeout(t);
  }, [isLive, onScreen, next, livePosts, playing, speed]);
  const liveShown = useMemo(() => (onScreen ? livePosts.filter((p) => onScreen.has(p.id)) : []), [livePosts, onScreen]);

  return {
    posts: isLive ? liveShown : fixture.slice(0, shown),
    total: isLive ? livePosts.length : fixture.length,
    isLive,
    playing, setPlaying, speed, setSpeed,
    restart: () => { setShown(FIRST); setPlaying(true); },
    done: !isLive && shown >= fixture.length,
  };
}
