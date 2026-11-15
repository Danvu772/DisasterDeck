"use client";
// Hold to talk that also sends, for the v2 field phone (components/v2/FieldV2.tsx): the browser's own
// speech recognition types the words (useDictation), only the text goes to /api/chat, and the phone's
// own voice reads the answer, so a field team with full hands hears it. No voice service is called.
// The main field phone (/field) uses useDictation alone and sends through the agents tab's path.
// Typing (sendText) works everywhere, also on a page without speech recognition.
import { useCallback, useEffect, useState } from "react";
import { useDictation } from "./useDictation";

export type TalkState = "unsupported" | "idle" | "recording" | "sending";

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
  const [sending, setSending] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => () => { synth()?.cancel(); }, []);

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

  const send = useCallback(async (text: string) => {
    setSaid(text);
    setSending(true);
    try {
      const r = await fetch(`/api/chat?user=${encodeURIComponent(user)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(30000),
      });
      const body = (await r.json().catch(() => ({}))) as { reply?: string; error?: string };
      if (r.ok && body.reply) { setReply(body.reply); speak(body.reply); }
      else setFailure(body.error ?? `The desk did not answer (${r.status})`);
    } catch {
      setFailure("Could not send the message, no network.");
    }
    setSending(false);
  }, [user, speak]);

  const dictation = useDictation((text) => { void send(text); });

  const start = useCallback(() => {
    if (sending) return;
    unlockVoice();
    hush();
    setFailure(null);
    setReply(null);
    setSaid(null);
    dictation.start();
  }, [sending, hush, dictation]);

  /** The typed way in. Call it from a tap or a submit, so the voice unlocks for the answer. */
  const sendText = useCallback((text: string) => {
    const t = text.trim();
    if (!t || sending || dictation.state === "recording") return;
    unlockVoice();
    setFailure(null);
    setReply(null);
    void send(t);
  }, [sending, dictation.state, send]);

  const state: TalkState = sending ? "sending" : dictation.state;
  return { state, said, reply, error: failure ?? dictation.error, speaking, start, stop: dictation.stop, sendText, hush };
}
