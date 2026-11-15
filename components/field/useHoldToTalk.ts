"use client";
// Hold to record, let go to send. MediaRecorder in, POST /api/chat with { audioBase64, mimeType } out.
// Phones only hand the mic to HTTPS pages (or localhost), so check that first.
import { useCallback, useEffect, useRef, useState } from "react";

export type TalkState = "unsupported" | "idle" | "starting" | "recording" | "sending";

const MIN_MS = 400;   // shorter than this is a tap, not a message

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export function useHoldToTalk(user: string) {
  const [state, setState] = useState<TalkState>("idle");
  const [reply, setReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const held = useRef(false);
  const rec = useRef<MediaRecorder | null>(null);
  const startedAt = useRef(0);

  useEffect(() => {
    const ok = window.isSecureContext && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
    if (!ok) setState("unsupported");
  }, []);

  const send = useCallback(async (blob: Blob, mimeType: string) => {
    setState("sending");
    try {
      const audioBase64 = await toBase64(blob);
      const r = await fetch(`/api/chat?user=${encodeURIComponent(user)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ audioBase64, mimeType }),
        signal: AbortSignal.timeout(30000),
      });
      const body = (await r.json().catch(() => ({}))) as { reply?: string; error?: string };
      if (r.ok && body.reply) setReply(body.reply);
      else setError(body.error ?? `The desk did not answer (${r.status})`);
    } catch {
      setError("Could not send the voice message, no network.");
    }
    setState("idle");
  }, [user]);

  const start = useCallback(async () => {
    if (state !== "idle") return;
    held.current = true;
    setError(null);
    setState("starting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("The phone did not give us the microphone.");
      setState("idle");
      return;
    }
    if (!held.current) {   // let go while the permission prompt was up
      stream.getTracks().forEach((t) => t.stop());
      setState("idle");
      return;
    }
    const chunks: Blob[] = [];
    const r = new MediaRecorder(stream);
    r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    r.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      rec.current = null;
      if (Date.now() - startedAt.current < MIN_MS || !chunks.length) {
        setError("Hold the button the whole time you talk.");
        setState("idle");
        return;
      }
      const mimeType = r.mimeType || chunks[0].type || "audio/webm";
      send(new Blob(chunks, { type: mimeType }), mimeType);
    };
    rec.current = r;
    startedAt.current = Date.now();
    r.start();
    setState("recording");
  }, [state, send]);

  const stop = useCallback(() => {
    held.current = false;
    if (rec.current?.state === "recording") rec.current.stop();
  }, []);

  return { state, reply, error, start, stop };
}
