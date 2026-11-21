"use client";
// Live metrics for the chat (t34). Polls the board, and the people list once GET /api/users exists,
// and recomputes the asked metrics on every poll. Fixtures (makeMetricInput) while the board API
// does not answer, and `live` says which one the numbers came from.
import { useMemo } from "react";
import type { Event, User } from "@/lib/types";
import { makeMetricInput } from "@/fixtures/metrics";
import { deskNow } from "../clock";
import { usePolled } from "../map/usePolled";
import { METRIC_IDS, metric, type MetricBoard, type MetricInput } from "./registry";
import { metricsForQuestion } from "./router";
import type { MetricId, MetricResult } from "./types";

const MAX = 2;

// What the chat shows: the agent's `show_metric` actions first (issue #27), else the question's words.
export function pickMetrics(question: string, body: unknown): MetricId[] {
  const actions = (body as { actions?: unknown } | null)?.actions;
  const asked = Array.isArray(actions)
    ? actions.flatMap((a) => {
      const { type, id } = (a ?? {}) as { type?: unknown; id?: unknown };
      return type === "show_metric" && METRIC_IDS.includes(id as MetricId) ? [id as MetricId] : [];
    })
    : [];
  const ids = asked.length ? [...new Set(asked)] : metricsForQuestion(question);
  return ids.slice(0, MAX);
}

// The route may answer a bare list or { users }. Anything else is no list.
export function usersOf(body: unknown): User[] | undefined {
  const xs = Array.isArray(body) ? body : (body as { users?: unknown } | null)?.users;
  return Array.isArray(xs) ? (xs as User[]) : undefined;
}

// Pure: what the engine gets. The live board with scenario time, or the fixture input.
export function metricInput(o: {
  board: MetricBoard | null; live: boolean; now: number; events?: Event[]; users?: User[];
}): MetricInput {
  if (!o.live || !o.board) return makeMetricInput(o.now);
  return { board: o.board, events: o.events, users: o.users, now: deskNow(o.now) };
}

// `events` is the feed the screen already holds, or undefined when it has none of its own.
export function useMetrics(ids: MetricId[], o: { events?: Event[]; user?: string } = {}) {
  const board = usePolled<MetricBoard | null>("/api/board", null);
  const users = usePolled<unknown>(`/api/users?user=${encodeURIComponent(o.user ?? "coordinator-duty")}`, null, 5000);
  const live = board.live && board.data !== null;
  const userList = users.live ? usersOf(users.data) : undefined;
  const { events } = o;

  const results = useMemo<MetricResult[]>(() => {
    const input = metricInput({ board: board.data, live, now: board.now, events, users: userList });
    return ids.map((id) => metric(id, input));
  }, [ids, board.data, live, board.now, events, userList]);

  return { results, live, checked: board.checked, at: board.now };
}
