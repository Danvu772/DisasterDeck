"use client";
// Microphone in, agent's voice out, both through one AudioContext so each has an AnalyserNode
// the Waveform can draw. The context is created on the first press (a user gesture), which is
// also what lets the reply play later without the browser's autoplay block.
import { useCallback, useRef, useState } from "react";

export type VoiceState = "idle" | "listening" | "thinking" | "speaking";

export function useVoice() {
  const ctxRef = useRef<AudioContext | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
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
    a.fftSize = 256;
    a.smoothingTimeConstant = 0.6;
    return a;
  };

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
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setMicAnalyser(null);
    recRef.current = null;
    const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
    if (blob.size < 2000) return null; // a tap, not a sentence
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(blob);
    });
  }, []);

  /** Play the agent's reply (mp3 data URL) through an analyser so its wave can be drawn. */
  const play = useCallback(async (dataUrl: string): Promise<void> => {
    const ctx = audio();
    const bytes = await (await fetch(dataUrl)).arrayBuffer();
    const buffer = await ctx.decodeAudioData(bytes);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const a = analyserOf(ctx);
    src.connect(a);
    a.connect(ctx.destination);
    setAgentAnalyser(a);
    await new Promise<void>((r) => { src.onended = () => r(); src.start(); });
    setAgentAnalyser(null);
  }, [audio]);

  return { start, stop, play, micAnalyser, agentAnalyser, error, setError };
}
