"use client";

import { useEffect, useRef, useState } from "react";
import type { Conversation } from "@elevenlabs/client";

type PersonUpdate = { id: string; alias: string; summary: string; sourceAt: string; demo: boolean };

export function FamilyCall() {
  const [people, setPeople] = useState<PersonUpdate[]>([]);
  const [personId, setPersonId] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("disconnected");
  const [mode, setMode] = useState("");
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [demo, setDemo] = useState(false);
  const [question, setQuestion] = useState("");
  const [sourceAt, setSourceAt] = useState("");
  const [messages, setMessages] = useState<{ role: string; message: string }[]>([]);
  const call = useRef<Conversation | null>(null);
  const generation = useRef(0);
  const starting = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const active = status !== "disconnected";
  const matches = people.filter(person => person.alias.toLocaleLowerCase("en-US").includes(search.trim().toLocaleLowerCase("en-US")));

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/voice/people", { signal: controller.signal, cache: "no-store" }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setPeople(data.people);
    }).catch(() => { if (!controller.signal.aborted) setError("Published updates could not be loaded. Refresh the page to try again."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  async function end() {
    generation.current++;
    starting.current = false;
    clearTimeout(timer.current);
    const current = call.current;
    call.current = null;
    setStatus("disconnected"); setMode(""); setMuted(false);
    await current?.endSession();
  }
  useEffect(() => () => {
    generation.current++;
    clearTimeout(timer.current);
    void call.current?.endSession();
    call.current = null;
  }, []);

  async function start(event: React.FormEvent) {
    event.preventDefault();
    if (starting.current || call.current) return;
    starting.current = true;
    const attempt = ++generation.current;
    setError(""); setMessages([]); setSourceAt(""); setStatus("connecting");
    try {
      const response = await fetch("/api/voice/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ personId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The call could not be started.");
      if (attempt !== generation.current) return;
      setDemo(data.demo === true);
      // Access material stays in this closure, never in localStorage or a URL.
      const { Conversation } = await import("@elevenlabs/client");
      if (attempt !== generation.current) return;
      const session = await Conversation.startSession({
        conversationToken: data.token,
        connectionType: "webrtc",
        clientTools: {
          ask_family_desk: async (params: { question?: unknown }) => {
            if (attempt !== generation.current) return "The call has ended. Do not provide any case information.";
            try {
              const result = await fetch("/api/voice/answer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticket: data.ticket, question: params.question }), signal: AbortSignal.timeout(55_000) });
              const answer = await result.json();
              if (!result.ok) { setError(answer.error || "The update could not be retrieved."); return "No verified answer is available. Tell the caller to end the call and contact the coordinator. Do not guess."; }
              if (attempt !== generation.current) return "The call has ended. Do not provide case information.";
              setSourceAt(answer.sourceAt || "");
              return answer.answer;
            } catch { setError("The answer service could not be reached."); return "Service unavailable. Ask the caller to contact the coordinator. Do not guess."; }
          },
        },
        onStatusChange: ({ status }) => { if (attempt === generation.current) setStatus(status); },
        onModeChange: ({ mode }) => { if (attempt === generation.current) setMode(mode); },
        onMessage: ({ role, message }) => { if (attempt === generation.current) setMessages(old => [...old.slice(-39), { role, message }]); },
        onDisconnect: () => { if (attempt === generation.current) { call.current = null; starting.current = false; clearTimeout(timer.current); setStatus("disconnected"); } },
        onError: () => { if (attempt === generation.current) { setError("The voice connection failed. Check your microphone permission and internet connection."); void end(); } },
      });
      if (attempt !== generation.current) { await session.endSession(); return; }
      call.current = session;
      starting.current = false;
      timer.current = setTimeout(() => { setError("The ten-minute call has ended."); void end(); }, data.expiresInSeconds * 1000);
    } catch (cause) {
      if (attempt === generation.current) { setError(cause instanceof Error ? cause.message : "The call could not be started."); starting.current = false; setStatus("disconnected"); }
    }
  }

  return <section className="space-y-4 rounded-card border border-line bg-card p-5">
    <form onSubmit={start} className="space-y-4">
      <label className="block font-bold">Who are you looking for?<input maxLength={100} disabled={active} value={search} onChange={e => { setSearch(e.target.value); setPersonId(""); }} placeholder="Enter a name" className="mt-1 block w-full rounded-button border border-line bg-paper p-3" /></label>
      {loading ? <p role="status">Loading updates…</p> : matches.length ? <fieldset className="max-h-80 space-y-3 overflow-y-auto"><legend className="mb-2 text-sm text-muted">Select the person you want to ask about ({matches.length})</legend>{matches.map(person => <label key={person.id} className="flex cursor-pointer items-start gap-3 rounded-button border border-line p-3">
        <input type="radio" name="person" required checked={personId === person.id} disabled={active} onChange={() => setPersonId(person.id)} className="mt-1" />
        <span className="min-w-0"><strong className="block">{person.alias}{person.demo && " · DEMO"}</strong><span className="mt-1 block whitespace-pre-wrap text-sm">{person.summary}</span><span className="mt-2 block text-xs text-muted">Source: {new Date(person.sourceAt).toLocaleString("en-US")}</span></span>
      </label>)}</fieldset> : <p className="text-muted">{people.length ? "No published update matches this name. Check the spelling or try another name." : "There are no published updates yet. New updates will appear here when available."}</p>}
      <p className="text-sm text-muted">Click Start voice call to begin the voice processing described below. Your browser will ask for microphone permission. Calls last up to ten minutes.</p>
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={active || !personId} className="rounded-button bg-primary px-5 py-3 font-bold text-card disabled:opacity-50">Start voice call</button>
        {active && <button type="button" onClick={() => void end()} className="rounded-button border border-line px-5 py-3 font-bold">End call</button>}
        {status === "connected" && <button type="button" onClick={() => { call.current?.setMicMuted(!muted); setMuted(!muted); }} className="rounded-button border border-line px-4 py-3">{muted ? "Unmute microphone" : "Mute microphone"}</button>}
      </div>
    </form>
    {status === "connected" && <form onSubmit={event => { event.preventDefault(); if (question.trim()) { call.current?.sendUserMessage(question.trim()); setQuestion(""); } }} className="flex flex-wrap items-end gap-2 border-t border-line pt-4">
      <label className="min-w-0 flex-1 text-sm font-bold">Or type your question<input value={question} onChange={e => setQuestion(e.target.value)} maxLength={2000} required className="mt-1 block w-full rounded-button border border-line bg-paper p-3" /></label>
      <button className="rounded-button border border-line px-4 py-3 font-bold">Send question</button>
    </form>}
    <p role="status" className="text-sm font-bold">{status === "connecting" ? "Connecting…" : status === "connected" ? (mode === "speaking" ? "Assistant speaking" : "Listening") : "Call ended"}{muted && " · Microphone muted"}</p>
    {demo && <p className="rounded-button border border-line p-3 font-bold">Demo: answers refer to a fictional exercise record.</p>}
    {sourceAt && <p className="text-sm text-muted">Source observation time: <time dateTime={sourceAt}>{new Date(sourceAt).toLocaleString("en-US")}</time>. This does not confirm the person’s current status.</p>}
    {error && <p role="alert" className="rounded-button border border-line p-3">{error}</p>}
    {messages.length > 0 && <div className="space-y-3 border-t border-line pt-4" aria-label="Call transcript">{messages.map((m, i) => <p key={i}><strong>{m.role === "user" ? "You" : "Assistant"}: </strong>{m.message}</p>)}</div>}
  </section>;
}
