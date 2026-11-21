"use client";
// Microphone in, agent's voice out, both through one AudioContext so each has an AnalyserNode
// the orb can follow. The context is created on the first press (a user gesture), which is
// also what lets the reply play later without the browser's autoplay block.
//
// Live transcription: while the person holds the orb, the microphone streams to ElevenLabs Scribe
// realtime (a single-use token from GET /api/chat/token, fetched ahead of time), and the words
// show as they are said. Audio from the moment of the press is kept and sent once the socket is
// open, so the first word is not lost. When they let go, the text is already there: no upload,
// no wait. Without a token (no ElevenLabs key) it falls back to recording a voice note.
//
// The reply arrives sentence by sentence (one mp3 each); they are queued back to back.
import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeConnection } from "@elevenlabs/client";

// The Scribe client is most of /talk's JavaScript: load it after the page is up, not with it
// (speed, 15 Nov). prefetch() starts the download, so the first press does not wait for it.
let scribeLib: Promise<typeof import("@elevenlabs/client")> | undefined;
const loadScribe = () => (scribeLib ??= import("@elevenlabs/client"));

export type VoiceState = "idle" | "listening" | "thinking" | "speaking";

const RATE = 16000;          // what Scribe realtime gets: 16 kHz, 16-bit mono PCM
const CHUNK = 1600;          // 100 ms per message
const COMMIT_WAIT_MS = 2500; // after letting go, how long to wait for the last words

// Copies each block of microphone samples to the main thread.
const WORKLET = `class DeskCapture extends AudioWorkletProcessor {
  process(inputs) { const ch = inputs[0] && inputs[0][0]; if (ch) this.port.postMessage(ch.slice(0)); return true; }
}
registerProcessor("desk-capture", DeskCapture);`;

function toBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Float samples at the context's rate → 16 kHz Int16, keeping the fractional position between blocks. */
function makeResampler(fromRate: number) {
  const step = fromRate / RATE;
  let pos = 0;
  return (input: Float32Array): Int16Array => {
    const out: number[] = [];
    for (; pos < input.length; pos += step) {
      const i = Math.floor(pos);
      const a = input[i];
      const b = i + 1 < input.length ? input[i + 1] : a;
      const v = a + (b - a) * (pos - i);
      out.push(Math.max(-1, Math.min(1, v)) * 0x7fff);
    }
    pos -= input.length;
    return Int16Array.from(out);
  };
}

interface Live {
  conn: RealtimeConnection;
  open: boolean;
  queued: string[];        // base64 chunks waiting for the socket
  pcm: number[];           // samples not yet sent
  committed: string[];
  partial: string;
  node: AudioWorkletNode;
  source: MediaStreamAudioSourceNode;
  done?: () => void;       // resolves stop() when the last committed transcript arrives
}

export function useVoice(userId: string) {
  const ctxRef = useRef<AudioContext | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const liveRef = useRef<Live | null>(null);
  const token = useRef<{ token: string; modelId: string; at: number } | null>(null);
  const liveOk = useRef(true);   // false after the token route says there is no live voice
  const workletReady = useRef<Promise<void> | null>(null);
  const [micAnalyser, setMicAnalyser] = useState<AnalyserNode | null>(null);
  const [agentAnalyser, setAgentAnalyser] = useState<AnalyserNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [partial, setPartial] = useState("");

  // Playback queue: sentences play back to back through one analyser.
  const out = useRef<{ analyser: AnalyserNode; next: number; sources: Set<AudioBufferSourceNode>; chain: Promise<void> } | null>(null);

  const audio = useCallback(() => {
    if (!ctxRef.current) ctxRef.current = new AudioContext();
    if (ctxRef.current.state === "suspended") void ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const analyserOf = (ctx: AudioContext) => {
    const a = ctx.createAnalyser();
    a.fftSize = 512;
    a.smoothingTimeConstant = 0.6;
    return a;
  };

  /** Get a token now, so pressing the orb does not wait for one. A token works once, for 15 minutes. */
  const prefetch = useCallback(async () => {
    if (!liveOk.current) return;
    loadScribe().catch(() => { scribeLib = undefined; });
    if (token.current && Date.now() - token.current.at < 10 * 60_000) return;
    try {
      const r = await fetch(`/api/chat/token?user=${encodeURIComponent(userId)}`, { cache: "no-store" });
      if (r.status === 404) { liveOk.current = false; return; }
      if (!r.ok) return;
      const j = (await r.json()) as { token?: string; modelId?: string };
      if (j.token) token.current = { token: j.token, modelId: j.modelId ?? "scribe_v3_live", at: Date.now() };
    } catch { /* the press tries again, or records a note */ }
  }, [userId]);
  useEffect(() => { void prefetch(); }, [prefetch]);

  const release = useCallback(() => {
    const l = liveRef.current;
    if (l) {
      l.node.port.onmessage = null;
      try { l.source.disconnect(); l.node.disconnect(); } catch { /* already gone */ }
      try { l.conn.close(); } catch { /* already closed */ }
      liveRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recRef.current = null;
    setMicAnalyser(null);
  }, []);

  /** Live path: stream the microphone to Scribe realtime. False if there is no token. */
  const startLive = useCallback(async (ctx: AudioContext, stream: MediaStream): Promise<boolean> => {
    if (!token.current) await prefetch();
    const t = token.current;
    token.current = null;
    if (!t) return false;
    workletReady.current ??= ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" })));
    await workletReady.current;
    const { AudioFormat, RealtimeEvents, Scribe } = await loadScribe();

    const conn = Scribe.connect({ token: t.token, modelId: t.modelId, audioFormat: AudioFormat.PCM_16000, sampleRate: RATE });
    const source = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, "desk-capture");
    const live: Live = { conn, open: false, queued: [], pcm: [], committed: [], partial: "", node, source };
    liveRef.current = live;
    const show = () => setPartial([...live.committed, live.partial].join(" ").replace(/\s+/g, " ").trim());

    conn.on(RealtimeEvents.OPEN, () => {
      live.open = true;
      for (const b of live.queued.splice(0)) conn.send({ audioBase64: b });
    });
    conn.on(RealtimeEvents.PARTIAL_TRANSCRIPT, (m) => { live.partial = m.text ?? ""; show(); });
    conn.on(RealtimeEvents.COMMITTED_TRANSCRIPT, (m) => {
      if (m.text?.trim()) live.committed.push(m.text.trim());
      live.partial = "";
      show();
      live.done?.();
    });
    const fail = () => { live.done?.(); };
    conn.on(RealtimeEvents.ERROR, fail);
    conn.on(RealtimeEvents.AUTH_ERROR, fail);
    conn.on(RealtimeEvents.CLOSE, fail);

    const resample = makeResampler(ctx.sampleRate);
    node.port.onmessage = (e: MessageEvent<Float32Array>) => {
      const pcm = resample(e.data);
      for (let i = 0; i < pcm.length; i++) live.pcm.push(pcm[i]);
      while (live.pcm.length >= CHUNK) {
        const b = toBase64(Int16Array.from(live.pcm.splice(0, CHUNK)));
        if (live.open) { try { conn.send({ audioBase64: b }); } catch { /* closed */ } } else live.queued.push(b);
      }
    };
    source.connect(node);
    // An AudioWorkletNode only runs when it leads somewhere; a muted gain keeps it off the speakers.
    const mute = ctx.createGain();
    mute.gain.value = 0;
    node.connect(mute).connect(ctx.destination);
    return true;
  }, [prefetch]);

  /** Start listening. Resolves false if the microphone is not available. */
  const start = useCallback(async (): Promise<boolean> => {
    setError(null);
    setPartial("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser cannot use the microphone here. On a phone the page must be on https.");
      return false;
    }
    try {
      const ctx = audio();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      streamRef.current = stream;
      const a = analyserOf(ctx);
      ctx.createMediaStreamSource(stream).connect(a); // to the analyser only, never to the speakers
      setMicAnalyser(a);
      if (liveOk.current && (await startLive(ctx, stream).catch(() => false))) return true;
      // Fallback: record a voice note and send it whole.
      chunks.current = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      rec.start();
      recRef.current = rec;
      return true;
    } catch {
      setError("Microphone permission was refused.");
      release();
      return false;
    }
  }, [audio, startLive, release]);

  /**
   * Stop listening. Live: { text } with what was said (already on screen). Fallback: { note } as a
   * data URL for the server to transcribe. Null if it was too short.
   */
  const stop = useCallback(async (): Promise<{ text: string } | { note: string } | null> => {
    const live = liveRef.current;
    if (live) {
      // Send the last samples, ask for the final words, and wait a moment for them.
      if (live.pcm.length && live.open) { try { live.conn.send({ audioBase64: toBase64(Int16Array.from(live.pcm.splice(0))) }); } catch { /* closed */ } }
      const last = new Promise<void>((r) => { live.done = r; setTimeout(r, COMMIT_WAIT_MS); });
      if (live.open) { try { live.conn.commit(); } catch { live.done?.(); } } else live.done?.();
      await last;
      const text = [...live.committed, live.partial].join(" ").replace(/\s+/g, " ").trim();
      release();
      void prefetch();
      return text ? { text } : null;
    }
    const rec = recRef.current;
    if (!rec) return null;
    const done = new Promise<void>((r) => { rec.onstop = () => r(); });
    rec.stop();
    await done;
    release();
    const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
    if (blob.size < 2000) return null; // a tap, not a sentence
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ note: String(reader.result) });
      reader.readAsDataURL(blob);
    });
  }, [release, prefetch]);

  /** Stop listening and throw it away (the button was let go before the mic was ready). */
  const cancel = useCallback(() => {
    const rec = recRef.current;
    if (rec && rec.state !== "inactive") { rec.onstop = null; rec.stop(); }
    chunks.current = [];
    setPartial("");
    release();
    void prefetch();
  }, [release, prefetch]);

  /** Queue one sentence of the reply (base64 mp3). It plays right after the one before. */
  const enqueue = useCallback((base64: string) => {
    const ctx = audio();
    if (!out.current) {
      const a = analyserOf(ctx);
      a.connect(ctx.destination);
      out.current = { analyser: a, next: 0, sources: new Set(), chain: Promise.resolve() };
      setAgentAnalyser(a);
    }
    const o = out.current;
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const decoded = ctx.decodeAudioData(bytes.buffer).catch(() => null);
    // Decode in parallel, start in order.
    o.chain = o.chain.then(async () => {
      const buffer = await decoded;
      if (!buffer || out.current !== o) return;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(o.analyser);
      const at = Math.max(ctx.currentTime + 0.02, o.next);
      src.start(at);
      o.next = at + buffer.duration;
      o.sources.add(src);
      src.onended = () => o.sources.delete(src);
    });
  }, [audio]);

  /** Resolves when everything queued so far has been played (or cut off). */
  const drained = useCallback(async () => {
    const o = out.current;
    if (!o) return;
    await o.chain;
    const ctx = ctxRef.current;
    // Never wait on a clock that is not running (audio blocked by the browser), nor past the end.
    const deadline = Date.now() + (ctx ? Math.max(0, o.next - ctx.currentTime) * 1000 : 0) + 1500;
    while (out.current === o && ctx && ctx.state === "running" && o.sources.size > 0 && ctx.currentTime < o.next && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, Math.min(250, Math.max(20, (o.next - ctx.currentTime) * 1000))));
    }
    if (out.current === o) { out.current = null; setAgentAnalyser(null); }
  }, []);

  /** Cut the agent off (the person pressed to talk over it). drained() resolves. */
  const stopPlayback = useCallback(() => {
    const o = out.current;
    out.current = null;
    if (o) for (const s of o.sources) { try { s.stop(); } catch { /* already ended */ } }
    setAgentAnalyser(null);
  }, []);

  /** Call inside a click or key press: browsers only let audio start from one. */
  const prime = useCallback(() => { audio(); }, [audio]);

  return { start, stop, cancel, enqueue, prime, drained, stopPlayback, partial, micAnalyser, agentAnalyser, error, setError };
}
