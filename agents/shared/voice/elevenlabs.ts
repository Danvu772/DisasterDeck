// ElevenLabs behind the voice port: Scribe for speech to text, eleven_v4_turbo for text to speech.
// Kept for "ElevenLabs for Government" (§4.5 fallback), the upgrade an agency can approve. Not the
// default. Plain fetch, no SDK.
//   ELEVENLABS_API_KEY            from elevenlabs.io
//   ELEVENLABS_STT_MODEL          default scribe_v3     (batch, 90+ languages)
//   ELEVENLABS_TTS_MODEL          default eleven_v4_turbo (low latency)
//   ELEVENLABS_VOICE_ID           default JBFqnCBsd6RMkjVDRZzb (a stock voice from the docs)
//   ELEVENLABS_STT_LIVE_MODEL     default scribe_v3_live

import type { VoicePort } from "./port";

const API = "https://api.elevenlabs.io/v1";

function key(): string {
  const k = process.env.ELEVENLABS_API_KEY;
  if (!k) throw new Error("ELEVENLABS_API_KEY is not set");
  return k;
}

export const LIVE_STT_MODEL = process.env.ELEVENLABS_STT_LIVE_MODEL ?? "scribe_v3_live";

export const elevenlabsPort: VoicePort = {
  name: "elevenlabs",

  enabled() {
    return Boolean(process.env.ELEVENLABS_API_KEY);
  },

  async transcribe(audio: Buffer, mimeType = "audio/webm") {
    const form = new FormData();
    form.append("model_id", process.env.ELEVENLABS_STT_MODEL ?? "scribe_v3");
    form.append("file", new Blob([new Uint8Array(audio)], { type: mimeType }), `voice.${mimeType.split("/")[1]?.split(";")[0] ?? "webm"}`);
    form.append("tag_audio_events", "false");   // "(siren)" in the text would only confuse the agent
    const res = await fetch(`${API}/speech-to-text`, {
      method: "POST", headers: { "xi-api-key": key() }, body: form, signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`ElevenLabs speech-to-text ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as { text?: string; language_code?: string; language_probability?: number };
    return { text: (j.text ?? "").trim(), languageCode: j.language_code, confidence: j.language_probability };
  },

  async speak(text: string, opts: { languageCode?: string; speed?: number } = {}) {
    const voice = process.env.ELEVENLABS_VOICE_ID ?? "JBFqnCBsd6RMkjVDRZzb";
    const res = await fetch(`${API}/text-to-speech/${voice}?output_format=mp3_44100_64`, {
      method: "POST",
      headers: { "xi-api-key": key(), "content-type": "application/json" },
      body: JSON.stringify({
        text: text.slice(0, 2000),
        model_id: process.env.ELEVENLABS_TTS_MODEL ?? "eleven_v4_turbo",
        ...(opts.languageCode ? { language_code: opts.languageCode } : {}),
        ...(opts.speed ? { voice_settings: { speed: Math.min(1.2, Math.max(0.7, opts.speed)) } } : {}),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`ElevenLabs text-to-speech ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return Buffer.from(await res.arrayBuffer());
  },

  async realtimeGrant() {
    const res = await fetch(`${API}/single-use-token/realtime_scribe`, {
      method: "POST", headers: { "xi-api-key": key() }, signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`ElevenLabs single-use token ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as { token?: string };
    if (!j.token) throw new Error("ElevenLabs single-use token: no token in the answer");
    return { token: j.token, modelId: LIVE_STT_MODEL };
  },
};
