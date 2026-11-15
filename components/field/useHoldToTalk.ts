"use client";
// Hold to talk on the field phone. Two engines, picked once from GET /api/chat:
//   elevenlabs  the phone records the microphone while the button is held and sends the voice note to
//               /api/chat. ElevenLabs Scribe turns it into text on the server, the agent answers, and the
//               answer comes back as ElevenLabs speech. `said` is what Scribe heard.
//   browser     no ElevenLabs key on the server: the browser's own speech recognition types the words,
//               only the text goes to /api/chat, and the phone's own voice reads the answer.
// Typing (sendText) works everywhere. Microphones need a secure page (HTTPS or localhost).
import { useCallback, useEffect, useRef, useState } from "react";
import { askAgent, canRecord, makePlayer, recorderMime, serverHasVoice, toDataUrl, type AgentAction, type AgentReply, type Player } from "./voiceClient";

export type TalkState = "unsupported" | "idle" | "starting" | "recording" | "sending";
export type Engine = "elevenlabs" | "browser";

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

/** A voice note shorter than this is a slip of the thumb, not a message. */
const MIN_NOTE_MS = 400;

export function useHoldToTalk(user: string) {
  const [state, setState] = useState<TalkState>("idle");
  const [engine, setEngine] = useState<Engine | null>(null);   // null until the server answered
  const [said, setSaid] = useState<string | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const rec = useRef<SpeechRec | null>(null);
  const heard = useRef("");
  const failed = useRef(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const released = useRef(false);
  const player = useRef<Player | null>(null);

  useEffect(() => {
    player.current = makePlayer(() => setSpeaking(false));
    let alive = true;
    serverHasVoice().then((voice) => {
      if (!alive) return;
      if (voice && canRecord()) { setEngine("elevenlabs"); return; }
      setEngine("browser");
      if (!speechCtor() || !window.isSecureContext) setState("unsupported");
    });
    return () => { alive = false; synth()?.cancel(); player.current?.stop(); };
  }, []);

  // The phone's own voice: the browser engine, and the fallback when ElevenLabs audio cannot play.
  const sayWithPhone = useCallback((text: string) => {
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

  const answer = useCallback((body: AgentReply) => {
    const text = body.reply ?? "";
    setReply(text);
    setActions(body.actions ?? []);
    if (body.replyAudio && player.current) {
      setSpeaking(true);
      player.current.play(body.replyAudio).catch(() => { setSpeaking(false); sayWithPhone(text); });
    } else if (text) {
      sayWithPhone(text);
    }
  }, [sayWithPhone]);

  const hush = useCallback(() => {
    synth()?.cancel();
    player.current?.stop();
    setSpeaking(false);
  }, []);

  const send = useCallback(async (payload: { text?: string; audioBase64?: string }, after: TalkState) => {
    setState("sending");
    try {
      const { status, body } = await askAgent(user, { ...payload, speak: engine === "elevenlabs" });
      if (body.heard !== undefined) setSaid(body.heard || "(no words heard)");
      if (status === 200 && body.reply) answer(body);
      else setError(body.error ?? `The desk did not answer (${status})`);
    } catch {
      setError("Could not send the message, no network.");
    }
    setState(after);
  }, [user, engine, answer]);

  const reset = useCallback(() => {
    hush();
    setError(null);
    setReply(null);
    setActions([]);
    setSaid(null);
  }, [hush]);

  // ElevenLabs: record while the button is held.
  const startRecording = useCallback(async () => {
    released.current = false;
    setState("starting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setError("The phone did not give us the microphone.");
      setState("idle");
      return;
    }
    const mime = recorderMime();
    const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunks.current = [];
    r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
    r.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      recorder.current = null;
      const blob = new Blob(chunks.current, { type: r.mimeType || mime || "audio/webm" });
      if (Date.now() - startedAt.current < MIN_NOTE_MS || !blob.size) {
        setError("Hold the button the whole time you talk.");
        setState("idle");
        return;
      }
      await send({ audioBase64: await toDataUrl(blob) }, "idle");
    };
    recorder.current = r;
    startedAt.current = Date.now();
    r.start();
    setState("recording");
    if (released.current) r.stop(); // let go before the microphone opened
  }, [send]);

  // Browser: the phone's speech recognition types the words.
  const startBrowser = useCallback(() => {
    const Ctor = speechCtor();
    if (!Ctor) { setState("unsupported"); return; }
    unlockVoice();
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
      if (text) { setSaid(text); void send({ text }, "idle"); return; }
      if (!failed.current) setError("Hold the button the whole time you talk.");
      setState("idle");
    };
    rec.current = r;
    setState("recording");
    r.start();
  }, [send]);

  const start = useCallback(() => {
    if (state !== "idle" || !engine) return;
    reset();
    if (engine === "elevenlabs") {
      player.current?.unlock(); // inside the tap, so the spoken reply may play later
      void startRecording();
    } else {
      startBrowser();
    }
  }, [state, engine, reset, startRecording, startBrowser]);

  const stop = useCallback(() => {
    released.current = true;
    if (recorder.current?.state === "recording") recorder.current.stop();
    rec.current?.stop();
  }, []);

  /** The typed way in. Call it from a tap or a submit, so the voice unlocks for the answer. */
  const sendText = useCallback((text: string) => {
    const t = text.trim();
    if (!t || state === "sending" || state === "recording" || state === "starting") return;
    reset();
    if (engine === "elevenlabs") player.current?.unlock();
    else unlockVoice();
    setSaid(t);
    // A phone without speech recognition goes back to "unsupported", so the hold button stays off.
    void send({ text: t }, state === "unsupported" ? "unsupported" : "idle");
  }, [state, engine, reset, send]);

  return { state, engine, said, reply, actions, error, speaking, start, stop, sendText, hush };
}
