// The field phone's voice pieces, shared by hold to talk and voice agent mode.
// Ask the server whether it has ElevenLabs, record the microphone, send a voice note to the agent
// (/api/chat transcribes it with ElevenLabs Scribe and answers), and play the spoken reply.
// One <audio> element is reused for every reply. It is unlocked during a tap, because phones only
// let a page play sound after a tap, and the reply arrives seconds later.

export interface AgentAction { tool: string; summary: string; ok: boolean }
export interface AgentReply {
  reply?: string; heard?: string; replyAudio?: string; error?: string; actions?: AgentAction[];
}

export async function serverHasVoice(): Promise<boolean> {
  try {
    const r = await fetch("/api/chat", { cache: "no-store" });
    if (!r.ok) return false;
    return Boolean(((await r.json()) as { voice?: unknown }).voice);
  } catch {
    return false;
  }
}

export function canRecord(): boolean {
  return typeof window !== "undefined" && window.isSecureContext
    && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";
}

// Opus in WebM on Chrome and Firefox, MP4/AAC on Safari. ElevenLabs takes all of them.
export function recorderMime(): string | undefined {
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]
    .find((m) => MediaRecorder.isTypeSupported(m));
}

export function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** One turn with the agent. `speak` asks for the reply as ElevenLabs audio too. */
export async function askAgent(user: string, body: { text?: string; audioBase64?: string; speak: boolean }): Promise<{ status: number; body: AgentReply }> {
  const r = await fetch(`/api/chat?user=${encodeURIComponent(user)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as AgentReply };
}

// 50 ms of silence as a WAV, made once. Playing it inside a tap unlocks the element for later replies.
let silence: string | null = null;
function silentWav(): string {
  if (silence) return silence;
  const n = 400;
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const ascii = (at: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i)); };
  ascii(0, "RIFF"); v.setUint32(4, 36 + n, true); ascii(8, "WAVE");
  ascii(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  ascii(36, "data"); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
  silence = URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
  return silence;
}

export interface Player {
  /** Call inside a tap. */
  unlock(): void;
  /** Starts the reply. `onEnd` (from makePlayer) fires when it finishes, fails or is stopped. */
  play(src: string): Promise<void>;
  stop(): void;
}

export function makePlayer(onEnd: () => void): Player {
  const el = new Audio();
  let unlocking = false;
  el.onended = () => { if (!unlocking) onEnd(); unlocking = false; };
  el.onerror = () => { if (!unlocking) onEnd(); unlocking = false; };
  return {
    unlock() {
      unlocking = true;
      el.src = silentWav();
      el.play().catch(() => { unlocking = false; });
    },
    async play(src) {
      unlocking = false;
      el.src = src;
      await el.play();
    },
    stop() {
      el.pause();
      el.removeAttribute("src");
      el.load();
      onEnd();
    },
  };
}
