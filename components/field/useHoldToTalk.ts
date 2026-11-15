"use client";
// Hold to talk: the browser turns speech into text (Web Speech API), and only the text goes to /api/chat.
// The route does not take audio (app/api/chat/route.ts says so), so nothing is recorded or uploaded.
// Phones only give the speech engine a secure page (HTTPS or localhost), so check that first.
import { useCallback, useEffect, useRef, useState } from "react";

export type TalkState = "unsupported" | "idle" | "starting" | "recording" | "sending";

type SpeechResult = { isFinal: boolean; 0: { transcript: string } };
type SpeechEvent = { resultIndex: number; results: ArrayLike<SpeechResult> };
type SpeechRec = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void;
};
type SpeechCtor = new () => SpeechRec;

function speechCtor(): SpeechCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useHoldToTalk(user: string) {
  const [state, setState] = useState<TalkState>("idle");
  const [reply, setReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<SpeechRec | null>(null);
  const heard = useRef("");
  const failed = useRef(false);

  useEffect(() => {
    if (!speechCtor() || !window.isSecureContext) setState("unsupported");
  }, []);

  const send = useCallback(async (text: string) => {
    setState("sending");
    try {
      const r = await fetch(`/api/chat?user=${encodeURIComponent(user)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(30000),
      });
      const body = (await r.json().catch(() => ({}))) as { reply?: string; error?: string };
      if (r.ok && body.reply) setReply(body.reply);
      else setError(body.error ?? `The desk did not answer (${r.status})`);
    } catch {
      setError("Could not send the message, no network.");
    }
    setState("idle");
  }, [user]);

  const start = useCallback(() => {
    if (state !== "idle") return;
    const Ctor = speechCtor();
    if (!Ctor) { setState("unsupported"); return; }
    setError(null);
    setReply(null);
    heard.current = "";
    failed.current = false;
    const r = new Ctor();
    r.lang = navigator.language || "en-US";
    r.interimResults = false;
    r.continuous = true;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        if (e.results[i].isFinal) heard.current += `${e.results[i][0].transcript} `;
      }
    };
    r.onerror = (e) => {
      failed.current = true;
      setError(e.error === "not-allowed" ? "The phone did not give us the microphone." : "Could not hear that. Try again.");
    };
    r.onend = () => {
      rec.current = null;
      const text = heard.current.trim();
      if (text) { send(text); return; }
      if (!failed.current) setError("Hold the button the whole time you talk.");
      setState("idle");
    };
    rec.current = r;
    setState("recording");
    r.start();
  }, [state, send]);

  const stop = useCallback(() => {
    rec.current?.stop();
  }, []);

  return { state, reply, error, start, stop };
}
