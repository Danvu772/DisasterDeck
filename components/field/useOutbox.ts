"use client";
// Posts to /api/events and keeps what the network dropped. Every post carries a dedupeKey,
// so a retry of something the desk already has returns the first id instead of a second event.
// localStorage can throw (private mode, full, blocked), so every access is wrapped.
import { useCallback, useEffect, useRef, useState } from "react";
import type { AnswerPayload, IncidentPayload } from "@/lib/types";

export type FieldEvent =
  | { type: "answer"; payload: AnswerPayload }
  | { type: "incident"; payload: IncidentPayload };

type Queued = FieldEvent & { source: "person"; dedupeKey: string; observedAt: string };

export type SendResult = { ok: true; queued: boolean } | { ok: false; error: string };

const RETRY_MS = 10000;
const storeKey = (user: string) => `field-outbox:${user}`;

function load(user: string): Queued[] {
  try {
    const raw = localStorage.getItem(storeKey(user));
    const q: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(q) ? (q as Queued[]) : [];
  } catch {
    return [];
  }
}

function save(user: string, q: Queued[]) {
  try {
    if (q.length) localStorage.setItem(storeKey(user), JSON.stringify(q));
    else localStorage.removeItem(storeKey(user));
  } catch {
    // storage blocked: the post stays in memory for this page only
  }
}

// crypto.randomUUID only exists on HTTPS pages, and the phone may be on plain http.
function newKey(user: string, e: FieldEvent): string {
  const rand = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `field:${user}:${e.payload.taskId ?? "none"}:${e.type}:${rand}`;
}

// "retry" when the network or the server failed, a message when the desk refused it.
async function post(user: string, item: Queued): Promise<"sent" | "retry" | string> {
  try {
    const r = await fetch(`/api/events?user=${encodeURIComponent(user)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(item),
      signal: AbortSignal.timeout(8000),   // a bad network hangs instead of failing
    });
    if (r.ok) return "sent";
    if (r.status >= 500) return "retry";
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    return body.error ?? `The desk refused it (${r.status})`;
  } catch {
    return "retry";
  }
}

export function useOutbox(user: string) {
  const [waiting, setWaiting] = useState(0);
  const memory = useRef<Queued[]>([]);   // used when localStorage is blocked
  const flushing = useRef(false);

  const read = useCallback(() => {
    const q = load(user);
    return q.length ? q : memory.current;
  }, [user]);
  const write = useCallback((q: Queued[]) => {
    memory.current = q;
    save(user, q);
    setWaiting(q.length);
  }, [user]);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    const done = new Set<string>();
    for (const item of read()) {
      const r = await post(user, item);
      if (r !== "retry") done.add(item.dedupeKey);   // sent, or refused for good
      else break;                                     // still offline, try the rest later
    }
    // Re-read: send() may have queued something while we were posting.
    write(read().filter((i) => !done.has(i.dedupeKey)));
    flushing.current = false;
  }, [user, read, write]);

  useEffect(() => {
    setWaiting(read().length);
    flush();
    const timer = setInterval(flush, RETRY_MS);
    window.addEventListener("online", flush);
    return () => { clearInterval(timer); window.removeEventListener("online", flush); };
  }, [read, flush]);

  const send = useCallback(async (e: FieldEvent): Promise<SendResult> => {
    const item: Queued = { ...e, source: "person", dedupeKey: newKey(user, e), observedAt: new Date().toISOString() };
    const r = await post(user, item);
    if (r === "sent") return { ok: true, queued: false };
    if (r === "retry") {
      write([...read(), item]);
      return { ok: true, queued: true };
    }
    return { ok: false, error: r };
  }, [user, read, write]);

  return { send, waiting };
}
