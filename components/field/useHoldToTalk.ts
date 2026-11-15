"use client";
// Hold to talk: the browser turns speech into text (Web Speech API), and only the text goes to /api/chat.
// The route does not take audio (app/api/chat/route.ts says so), so nothing is recorded or uploaded.
// Phones only give the speech engine a secure page (HTTPS or localhost), so check that first.
// The agent answers out loud: the reply is read by the phone's own speech synthesis, so a field
// team with full hands hears it. Typing (sendText) works everywhere, for a page on plain HTTP.
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

const synth = () => (typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null);

// iOS only lets a page speak after it spoke once inside a tap. The reply arrives seconds after the
// tap, so say nothing during the tap itself to unlock the voice for later.
function unlockVoice() {
  const s = synth();
  if (!s) return;
  s.cancel();
  s.speak(new SpeechSynthesisUtterance(""));
}

export function useHoldToTalk(user: string) {
  const [state, setState] = useState<TalkState>("idle");
  const [said, setSaid] = useState<string | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const rec = useRef<SpeechRec | null>(null);
  const heard = useRef("");
  const failed = useRef(false);

  useEffect(() => {
    if (!speechCtor() || !window.isSecureContext) setState("unsupported");
    return () => { synth()?.cancel(); };
  }, []);

  const speak = useCallback((text: string) => {
    const s = synth();
    if (!s) return;
    s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = navigator.language || "en-US";
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    s.speak(u);
  }, []);

  const hush = useCallback(() => {
    synth()?.cancel();
    setSpeaking(false);
  }, []);

  const send = useCallback(async (text: string, after: TalkState) => {
    setSaid(text);
    setState("sending");
    try {
      const r = await fetch(`/api/chat?user=${encodeURIComponent(user)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(30000),
      });
      const body = (await r.json().catch(() => ({}))) as { reply?: string; error?: string };
      if (r.ok && body.reply) { setReply(body.reply); speak(body.reply); }
      else setError(body.error ?? `The desk did not answer (${r.status})`);
    } catch {
      setError("Could not send the message, no network.");
    }
    setState(after);
  }, [user, speak]);

  const start = useCallback(() => {
    if (state !== "idle") return;
    const Ctor = speechCtor();
    if (!Ctor) { setState("unsupported"); return; }
    unlockVoice();
    setSpeaking(false);
    setError(null);
    setReply(null);
    setSaid(null);
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
      if (text) { send(text, "idle"); return; }
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

  /** The typed way in. Call it from a tap or a submit, so the voice unlocks for the answer. */
  const sendText = useCallback((text: string) => {
    const t = text.trim();
    if (!t || state === "sending" || state === "recording") return;
    unlockVoice();
    setError(null);
    setReply(null);
    // A phone without speech recognition goes back to "unsupported", so the hold button stays off.
    void send(t, state === "unsupported" ? "unsupported" : "idle");
  }, [state, send]);

  return { state, said, reply, error, speaking, start, stop, sendText, hush };
}
