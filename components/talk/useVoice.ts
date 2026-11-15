"use client";
// Microphone in, agent's voice out, both through one AudioContext so each has an AnalyserNode
// the orb can follow. The context is created on the first press (a user gesture), which is
// also what lets the reply play later without the browser's autoplay block.
import { useCallback, useRef, useState } from "react";

export type VoiceState = "idle" | "listening" | "thinking" | "speaking";

/** A decoded reply: its length (so the text can flow with it) and a way to play it. */
export interface LoadedReply { seconds: number; play: () => Promise<void> }

export function useVoice() {
  const ctxRef = useRef<AudioContext | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const playing = useRef<AudioBufferSourceNode | null>(null);
  const [micAnalyser, setMicAnalyser] = useState<AnalyserNode | null>(null);
  const [agentAnalyser, setAgentAnalyser] = useState<AnalyserNode | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const release = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recRef.current = null;
    setMicAnalyser(null);
  }, []);

  /** Start recording. Resolves false if the microphone is not available. */
  const start = useCallback(async (): Promise<boolean> => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser cannot use the microphone here. On a phone the page must be on https.");
      return false;
    }
    try {
      const ctx = audio();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const a = analyserOf(ctx);
      ctx.createMediaStreamSource(stream).connect(a); // to the analyser only, never to the speakers
      setMicAnalyser(a);
      chunks.current = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      rec.start();
      recRef.current = rec;
      return true;
    } catch {
      setError("Microphone permission was refused.");
      return false;
    }
  }, [audio]);

  /** Stop recording and return the voice note as a data URL, or null if it was too short. */
  const stop = useCallback(async (): Promise<string | null> => {
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
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(blob);
    });
  }, [release]);

  /** Stop recording and throw it away (the button was let go before the mic was ready). */
  const cancel = useCallback(() => {
    const rec = recRef.current;
    if (rec && rec.state !== "inactive") { rec.onstop = null; rec.stop(); }
    chunks.current = [];
    release();
  }, [release]);

  /** Decode the agent's reply (mp3 data URL). Playing it goes through an analyser for the orb. */
  const load = useCallback(async (dataUrl: string): Promise<LoadedReply> => {
    const ctx = audio();
    const bytes = await (await fetch(dataUrl)).arrayBuffer();
    const buffer = await ctx.decodeAudioData(bytes);
    return {
      seconds: buffer.duration,
      play: async () => {
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const a = analyserOf(ctx);
        src.connect(a);
        a.connect(ctx.destination);
        playing.current = src;
        setAgentAnalyser(a);
        await new Promise<void>((r) => { src.onended = () => r(); src.start(); });
        if (playing.current === src) playing.current = null;
        setAgentAnalyser(null);
      },
    };
  }, [audio]);

  /** Cut the agent off (the person pressed to talk over it). Its play() promise resolves. */
  const stopPlayback = useCallback(() => {
    try { playing.current?.stop(); } catch { /* already ended */ }
    playing.current = null;
  }, []);

  return { start, stop, cancel, load, stopPlayback, micAnalyser, agentAnalyser, error, setError };
}
