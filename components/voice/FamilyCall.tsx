"use client";

import { useEffect, useRef, useState } from "react";
import type { Conversation } from "@elevenlabs/client";

export function FamilyCall() {
  const [reference, setReference] = useState("");
  const [pin, setPin] = useState("");
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
      const response = await fetch("/api/voice/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reference: reference.trim().toLowerCase(), pin }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Görüşme başlatılamadı.");
      if (attempt !== generation.current) return;
      setDemo(data.demo === true); setPin("");
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
              if (!result.ok) { setError(answer.error || "Bilgi alınamadı."); return "No verified answer is available. Tell the caller to end the call and contact the coordinator. Do not guess."; }
              if (attempt !== generation.current) return "The call has ended. Do not provide case information.";
              setSourceAt(answer.sourceAt || "");
              return answer.answer;
            } catch { setError("Yanıt servisine ulaşılamadı."); return "Service unavailable. Ask the caller to contact the coordinator. Do not guess."; }
          },
        },
        onStatusChange: ({ status }) => { if (attempt === generation.current) setStatus(status); },
        onModeChange: ({ mode }) => { if (attempt === generation.current) setMode(mode); },
        onMessage: ({ role, message }) => { if (attempt === generation.current) setMessages(old => [...old.slice(-39), { role, message }]); },
        onDisconnect: () => { if (attempt === generation.current) { call.current = null; starting.current = false; clearTimeout(timer.current); setStatus("disconnected"); } },
        onError: () => { if (attempt === generation.current) { setError("Ses bağlantısı kesildi. Mikrofon iznini ve internet bağlantınızı kontrol edin."); void end(); } },
      });
      if (attempt !== generation.current) { await session.endSession(); return; }
      call.current = session;
      starting.current = false;
      timer.current = setTimeout(() => { setError("10 dakikalık görüşme süresi doldu."); void end(); }, data.expiresInSeconds * 1000);
    } catch (cause) {
      if (attempt === generation.current) { setError(cause instanceof Error ? cause.message : "Görüşme başlatılamadı."); starting.current = false; setStatus("disconnected"); }
    }
  }

  return <section className="space-y-4 rounded-card border border-line bg-card p-5">
    <form onSubmit={start} className="space-y-4">
      <label className="block font-bold">Referans kodu<input required pattern="[a-fA-F0-9]{16}" maxLength={16} disabled={active} value={reference} onChange={e => setReference(e.target.value)} autoComplete="off" className="mt-1 block w-full rounded-button border border-line bg-paper p-3 font-mono" /></label>
      <label className="block font-bold">8 haneli PIN<input required pattern="[0-9]{8}" maxLength={8} inputMode="numeric" type="password" disabled={active} value={pin} onChange={e => setPin(e.target.value)} autoComplete="off" className="mt-1 block w-full rounded-button border border-line bg-paper p-3" /></label>
      <p className="text-sm text-muted">“Sesli ara” düğmesine basınca aşağıdaki açıklamada belirtilen ses işleme başlar ve tarayıcı mikrofon izni ister. Görüşme en fazla 10 dakika sürer.</p>
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={active} className="rounded-button bg-primary px-5 py-3 font-bold text-card disabled:opacity-50">Sesli ara</button>
        {active && <button type="button" onClick={() => void end()} className="rounded-button border border-line px-5 py-3 font-bold">Görüşmeyi bitir</button>}
        {status === "connected" && <button type="button" onClick={() => { call.current?.setMicMuted(!muted); setMuted(!muted); }} className="rounded-button border border-line px-4 py-3">{muted ? "Mikrofonu aç" : "Mikrofonu kapat"}</button>}
      </div>
    </form>
    {status === "connected" && <form onSubmit={event => { event.preventDefault(); if (question.trim()) { call.current?.sendUserMessage(question.trim()); setQuestion(""); } }} className="flex flex-wrap items-end gap-2 border-t border-line pt-4">
      <label className="min-w-0 flex-1 text-sm font-bold">İsterseniz sorunuzu yazın<input value={question} onChange={e => setQuestion(e.target.value)} maxLength={2000} required className="mt-1 block w-full rounded-button border border-line bg-paper p-3" /></label>
      <button className="rounded-button border border-line px-4 py-3 font-bold">Soruyu gönder</button>
    </form>}
    <p role="status" className="text-sm font-bold">{status === "connecting" ? "Bağlanıyor…" : status === "connected" ? (mode === "speaking" ? "Asistan konuşuyor" : "Dinliyor") : "Görüşme kapalı"}{muted && " · Mikrofon kapalı"}</p>
    {demo && <p className="rounded-button border border-line p-3 font-bold">Demo: yanıtlar kurgusal bir tatbikat kaydına aittir.</p>}
    {sourceAt && <p className="text-sm text-muted">Yanıtın kaynak zamanı: <time dateTime={sourceAt}>{new Date(sourceAt).toLocaleString("tr-TR")}</time>. Bu, güncel bir durum doğrulaması değildir.</p>}
    {error && <p role="alert" className="rounded-button border border-line p-3">{error}</p>}
    {messages.length > 0 && <div className="space-y-3 border-t border-line pt-4" aria-label="Görüşme metni">{messages.map((m, i) => <p key={i}><strong>{m.role === "user" ? "Siz" : "Asistan"}: </strong>{m.message}</p>)}</div>}
  </section>;
}
