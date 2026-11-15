"use client";
// Voice agent mode: hands-free control of the field agent through ElevenLabs, for a team with full
// hands or anyone who cannot use the screen. Turn it on once. It listens, records each sentence,
// sends it to /api/chat as a voice note (ElevenLabs Scribe turns it into text, the agent acts on it,
// ElevenLabs speaks the answer), plays the answer and listens again. Everything the agent does from
// text it does from here: answer a task, report a problem, file a report or a closed road, ask the desk.
//
// A sentence starts when the microphone level stays over a threshold for ONSET_MS and ends after
// SILENCE_MS of quiet. The threshold comes from the room: the first CALIBRATE_MS measure the noise.
// While the agent thinks or speaks, the microphone is ignored, so it never hears itself.
// It turns itself off after IDLE_MS without speech, so a forgotten phone does not spend voice credits.
import { useCallback, useEffect, useRef, useState } from "react";
import { askAgent, makePlayer, recorderMime, toDataUrl, type AgentAction, type Player } from "./voiceClient";

export type AgentState = "off" | "starting" | "listening" | "hearing" | "thinking" | "speaking" | "waiting";
export interface Exchange { said: string; reply: string; actions: AgentAction[] }

const TICK_MS = 50;
const CALIBRATE_MS = 600;
const ONSET_MS = 120;
const SILENCE_MS = 1200;
const MIN_SPEECH_MS = 500;      // shorter is a cough or a door, never sent
const MAX_NOTE_MS = 30_000;
const IDLE_MS = 120_000;
const RATE_PAUSE_MS = 60_000;   // /api/chat said too many messages
const AFTER_REPLY_MS = 300;     // the tail of the reply must not count as the person speaking

interface Live {
  state: AgentState;
  stream: MediaStream | null;
  ctx: AudioContext | null;
  analyser: AnalyserNode | null;
  buf: Float32Array<ArrayBuffer> | null;
  timer: number;
  recorder: MediaRecorder | null;
  chunks: Blob[];
  discard: boolean;
  startedAt: number;
  noteStart: number;
  loudSince: number;
  quietSince: number;
  lastLoud: number;
  lastSpeech: number;
  floor: number[];
  threshold: number;
  player: Player | null;
}

export function useVoiceAgent(user: string) {
  const [state, setState] = useState<AgentState>("off");
  const [note, setNote] = useState<string | null>(null);   // what a screen reader announces
  const [last, setLast] = useState<Exchange | null>(null);
  const live = useRef<Live>({
    state: "off", stream: null, ctx: null, analyser: null, buf: null, timer: 0, recorder: null, chunks: [],
    discard: false, startedAt: 0, noteStart: 0, loudSince: 0, quietSince: 0, lastLoud: 0, lastSpeech: 0,
    floor: [], threshold: 0.02, player: null,
  });

  const set = useCallback((s: AgentState) => { live.current.state = s; setState(s); }, []);

  const listen = useCallback(() => {
    const c = live.current;
    c.lastSpeech = Date.now();
    c.loudSince = 0;
    set("listening");
  }, [set]);

  const teardown = useCallback(() => {
    const c = live.current;
    window.clearInterval(c.timer);
    c.timer = 0;
    if (c.recorder?.state === "recording") { c.discard = true; c.recorder.stop(); }
    c.stream?.getTracks().forEach((t) => t.stop());
    c.stream = null;
    void c.ctx?.close().catch(() => {});
    c.ctx = null;
    c.analyser = null;
  }, []);

  const stop = useCallback((why: string) => {
    set("off");
    teardown();
    live.current.player?.stop();
    setNote(why);
  }, [set, teardown]);

  const send = useCallback(async (blob: Blob) => {
    const c = live.current;
    set("thinking");
    setNote("Got it. Your agent is working on it.");
    let res: Awaited<ReturnType<typeof askAgent>>;
    try {
      res = await askAgent(user, { audioBase64: await toDataUrl(blob), speak: true });
    } catch {
      if (c.state !== "off") { setNote("No network. Listening again."); listen(); }
      return;
    }
    if (c.state === "off") return;
    const { status, body } = res;
    if (status === 429) {
      set("waiting");
      setNote("Too many messages. The voice agent waits a minute, then listens again.");
      window.setTimeout(() => { if (live.current.state === "waiting") listen(); }, RATE_PAUSE_MS);
      return;
    }
    if (status !== 200 || !body.reply) {
      setNote(`${body.error ?? `The desk did not answer (${status})`}. Listening again.`);
      listen();
      return;
    }
    if (body.heard === "") { setNote("No words heard. Listening again."); listen(); return; }
    const actions = body.actions ?? [];
    setLast({ said: body.heard ?? "", reply: body.reply, actions });
    setNote(actions.length
      ? actions.map((a) => `${a.ok ? "Done" : "Not done"}: ${a.summary}`).join(". ")
      : "Your agent answered.");
    if (body.replyAudio && c.player) {
      set("speaking");
      c.player.play(body.replyAudio).catch(() => listen());
    } else {
      listen();
    }
  }, [user, set, listen]);

  const begin = useCallback((now: number) => {
    const c = live.current;
    if (!c.stream) return;
    const mime = recorderMime();
    const rec = new MediaRecorder(c.stream, mime ? { mimeType: mime } : undefined);
    c.chunks = [];
    c.discard = false;
    rec.ondataavailable = (e) => { if (e.data.size) c.chunks.push(e.data); };
    rec.onstop = () => {
      c.recorder = null;
      if (c.discard || c.state === "off") return;
      if (c.lastLoud - c.noteStart < MIN_SPEECH_MS) { listen(); return; }
      c.lastSpeech = Date.now();
      void send(new Blob(c.chunks, { type: rec.mimeType || mime || "audio/webm" }));
    };
    c.recorder = rec;
    c.noteStart = now - ONSET_MS;
    c.lastLoud = now;
    c.quietSince = 0;
    rec.start();
    set("hearing");
  }, [set, listen, send]);

  const end = useCallback(() => {
    const c = live.current;
    if (c.recorder?.state !== "recording") return;
    set("thinking");
    c.recorder.stop();
  }, [set]);

  const tick = useCallback(() => {
    const c = live.current;
    if (!c.analyser || !c.buf) return;
    c.analyser.getFloatTimeDomainData(c.buf);
    let sum = 0;
    for (const x of c.buf) sum += x * x;
    const level = Math.sqrt(sum / c.buf.length);
    const now = Date.now();
    if (c.state === "starting") {
      c.floor.push(level);
      if (now - c.startedAt >= CALIBRATE_MS) {
        const noise = c.floor.reduce((a, b) => a + b, 0) / c.floor.length;
        c.threshold = Math.min(0.08, Math.max(0.015, noise * 3));
        listen();
        setNote("Voice agent on. Say what you need.");
      }
      return;
    }
    const loud = level > c.threshold;
    if (c.state === "listening") {
      if (loud) {
        if (!c.loudSince) c.loudSince = now;
        if (now - c.loudSince >= ONSET_MS) begin(now);
      } else {
        c.loudSince = 0;
      }
      if (now - c.lastSpeech > IDLE_MS) stop("Voice agent off after 2 minutes without speech.");
    } else if (c.state === "hearing") {
      if (loud) { c.lastLoud = now; c.quietSince = 0; }
      else {
        if (!c.quietSince) c.quietSince = now;
        if (now - c.quietSince >= SILENCE_MS) end();
      }
      if (now - c.noteStart >= MAX_NOTE_MS) end();
    }
  }, [listen, begin, end, stop]);

  const start = useCallback(async () => {
    const c = live.current;
    if (c.state !== "off") return;
    // Both inside the tap: phones only allow sound and audio processing that a tap started.
    c.player?.unlock();
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    c.ctx = ctx;
    void ctx.resume();
    set("starting");
    setNote("Voice agent starting. Allow the microphone.");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch {
      teardown();
      set("off");
      setNote("The phone did not give us the microphone.");
      return;
    }
    if (c.state === "off") { stream.getTracks().forEach((t) => t.stop()); return; } // turned off while asking
    c.stream = stream;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    c.analyser = analyser;
    c.buf = new Float32Array(analyser.fftSize);
    c.floor = [];
    c.startedAt = Date.now();
    c.lastSpeech = Date.now();
    c.timer = window.setInterval(tick, TICK_MS);
  }, [set, teardown, tick]);

  const toggle = useCallback(() => {
    if (live.current.state === "off") void start();
    else stop("Voice agent off.");
  }, [start, stop]);

  useEffect(() => {
    const c = live.current;
    c.player = makePlayer(() => {
      if (live.current.state !== "speaking") return;
      window.setTimeout(() => { if (live.current.state === "speaking") listen(); }, AFTER_REPLY_MS);
    });
    return () => {
      c.state = "off";
      teardown();
      c.player?.stop();
    };
  }, [listen, teardown]);

  return { state, on: state !== "off", note, last, toggle };
}
