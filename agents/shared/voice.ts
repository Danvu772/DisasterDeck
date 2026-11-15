// ElevenLabs: speech to text (Scribe) and text to speech, for the people who cannot type —
// a field team in the rubble, a supplier driving. Plain fetch, no SDK.
//   ELEVENLABS_API_KEY            from elevenlabs.io (hackathon Creator plan), in .env.local
//   ELEVENLABS_STT_MODEL          default scribe_v3     (batch, 90+ languages, Turkish included)
//   ELEVENLABS_TTS_MODEL          default eleven_v4_turbo (low latency, ~100 ms median, Turkish included)
//   ELEVENLABS_VOICE_ID           default JBFqnCBsd6RMkjVDRZzb (a stock voice from the docs)
// Checked against the ElevenLabs API reference on 15 Nov 2026.

const API = "https://api.elevenlabs.io/v1";

export function voiceEnabled(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

function key(): string {
  const k = process.env.ELEVENLABS_API_KEY;
  if (!k) throw new Error("ELEVENLABS_API_KEY is not set");
  return k;
}

export interface Transcript { text: string; languageCode?: string; confidence?: number }

/** Audio (any common format: webm/opus from a phone browser, m4a, mp3, wav) → text. */
export async function transcribe(audio: Buffer, mimeType = "audio/webm"): Promise<Transcript> {
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
}

/** Text → MP3. Short replies only: the agent's answers are one to three sentences. */
export async function speak(text: string, opts: { languageCode?: string } = {}): Promise<Buffer> {
  const voice = process.env.ELEVENLABS_VOICE_ID ?? "JBFqnCBsd6RMkjVDRZzb";
  const res = await fetch(`${API}/text-to-speech/${voice}?output_format=mp3_44100_64`, {
    method: "POST",
    headers: { "xi-api-key": key(), "content-type": "application/json" },
    body: JSON.stringify({
      text: text.slice(0, 2000),
      model_id: process.env.ELEVENLABS_TTS_MODEL ?? "eleven_v4_turbo",
      ...(opts.languageCode ? { language_code: opts.languageCode } : {}),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`ElevenLabs text-to-speech ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}
