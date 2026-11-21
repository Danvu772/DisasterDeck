"use client";
// Hold to talk as dictation: the browser's own speech recognition (Web Speech API) turns what the
// person says into text while the button is held, and hands the text back. Nothing else: no audio
// leaves the phone, nothing is sent, no voice service is called. The caller decides what to do with it.
// Phones only give the speech engine a secure page (HTTPS or localhost).
import { useCallback, useEffect, useRef, useState } from "react";

export type DictationState = "unsupported" | "idle" | "recording";

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

/** `onText` gets the words once the button is let go. It is not called when nothing was heard. */
export function useDictation(onText: (text: string) => void) {
  const [state, setState] = useState<DictationState>("idle");
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<SpeechRec | null>(null);
  const heard = useRef("");
  const failed = useRef(false);
  const handler = useRef(onText);
  useEffect(() => { handler.current = onText; }, [onText]);

  useEffect(() => {
    if (!speechCtor() || !window.isSecureContext) setState("unsupported");
  }, []);

  const start = useCallback(() => {
    if (state !== "idle") return;
    const Ctor = speechCtor();
    if (!Ctor) { setState("unsupported"); return; }
    setError(null);
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
      setState("idle");
      const text = heard.current.trim();
      if (text) { handler.current(text); return; }
      if (!failed.current) setError("Hold the button the whole time you talk.");
    };
    rec.current = r;
    setState("recording");
    r.start();
  }, [state]);

  const stop = useCallback(() => { rec.current?.stop(); }, []);

  return { state, error, start, stop };
}
