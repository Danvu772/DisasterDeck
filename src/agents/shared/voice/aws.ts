// Amazon Transcribe + Polly behind the voice port. The default (§4.5, D-0005).
// Credentials come from the default chain only (ECS task role → EC2 instance role → shared file →
// env), never hardcoded keys, resolved lazily on the first call (fromNodeProviderChain).
//
//   VOICE_PROVIDER=aws          (default) picks this provider
//   AWS_REGION                  default us-east-1
//   AWS_TRANSCRIBE_BUCKET       S3 bucket for batch transcription jobs (voice notes)
//   POLLY_VOICE_ID              default per-language (Joanna en / Mia es)
//   POLLY_ENGINE                default neural
//
// Mapping:
//   transcribe()   a finished, compressed voice note (webm/opus, m4a, mp3) → Transcribe BATCH
//                  (StartTranscriptionJob). Batch is the right tool here: it takes webm/m4a/mp3
//                  directly, where streaming wants raw PCM, and a voice note is a complete file.
//   realtimeGrant()/talk → Transcribe STREAMING (StartStreamTranscription), presigned so the browser
//                  WebSocket dials Transcribe straight and streams the mic (16 kHz PCM it already
//                  resamples); no audio passes through the server.
//   speak()        Polly SynthesizeSpeech, MP3, neural.
//
// Coverage: Transcribe and Polly are GA for English and Spanish (and Turkish); the Siri/Joanna pair
// covers the pilot (en, es).

import { randomUUID } from "node:crypto";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { GetTranscriptionJobCommand, StartTranscriptionJobCommand, TranscribeClient } from "@aws-sdk/client-transcribe";
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { presignWebSocket } from "./sigv4";
import type { Transcript, VoicePort } from "./port";

const REGION = process.env.AWS_REGION ?? "us-east-1";

const TTS_VOICES: Record<string, string> = { en: "Joanna", es: "Mia", tr: "Filiz" };

// ── credentials (default chain, resolved lazily on the first call) ────────────────────────────
let credsPromise: Promise<{ accessKeyId: string; secretAccessKey: string; sessionToken?: string }> | null = null;
function creds() {
  return (credsPromise ??= fromNodeProviderChain()().then((c) => ({
    accessKeyId: c.accessKeyId,
    secretAccessKey: c.secretAccessKey,
    sessionToken: c.sessionToken,
  })));
}

function bucket(): string {
  const b = process.env.AWS_TRANSCRIBE_BUCKET;
  if (!b) throw new Error("AWS_TRANSCRIBE_BUCKET is not set");
  return b;
}

// An mp3, webm, m4a ... → the Transcribe MediaFormat string. Batch takes the common phone formats.
function mediaFormat(mimeType: string): string {
  const m = mimeType.split(";")[0].toLowerCase();
  if (m.includes("webm")) return "webm";
  if (m === "audio/mp4" || m === "audio/m4a" || m === "video/mp4" || m.includes("mp4")) return "mp4";
  if (m.includes("mpeg") || m === "audio/mp3") return "mp3";
  if (m.includes("wav")) return "wav";
  if (m.includes("flac")) return "flac";
  if (m.includes("ogg")) return "ogg";
  return "mp4";
}

async function transcribeBatch(audio: Buffer, mimeType: string): Promise<Transcript> {
  const c = await creds();
  const s3 = new S3Client({ region: REGION, credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey, sessionToken: c.sessionToken } });
  const transcribe = new TranscribeClient({ region: REGION, credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey, sessionToken: c.sessionToken } });

  const key = `voice/${randomUUID()}.${mediaFormat(mimeType)}`;
  await s3.send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: new Uint8Array(audio), ContentType: mimeType }));

  const name = `voice-${randomUUID()}`;
  await transcribe.send(new StartTranscriptionJobCommand({
    TranscriptionJobName: name,
    IdentifyLanguage: true,                 // en / es / tr detected, no hint needed
    Media: { MediaFileUri: `s3://${bucket()}/${key}` },
    MediaFormat: mediaFormat(mimeType) as never,
  }));

  // Poll until COMPLETED or FAILED. Voice notes are seconds long; the job is usually done in a few.
  for (;;) {
    const job = await transcribe.send(new GetTranscriptionJobCommand({ TranscriptionJobName: name }));
    const status = job.TranscriptionJob?.TranscriptionJobStatus;
    if (status === "COMPLETED") {
      const uri = job.TranscriptionJob?.Transcript?.TranscriptFileUri;
      if (!uri) return { text: "", languageCode: undefined };
      const res = await fetch(uri, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`Transcribe transcript fetch ${res.status}`);
      const j = (await res.json()) as {
        results?: { transcripts?: { transcript?: string }[]; language_codes?: { language_code?: string }[]; language_code?: string };
      };
      const text = (j.results?.transcripts?.[0]?.transcript ?? "").trim();
      return { text, languageCode: j.results?.language_codes?.[0]?.language_code ?? j.results?.language_code };
    }
    if (status === "FAILED") throw new Error(`Transcribe job failed: ${job.TranscriptionJob?.FailureReason ?? "unknown"}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

export const awsPort: VoicePort = {
  name: "aws",

  enabled() {
    // Chosen when VOICE_PROVIDER is unset or "aws", and the default chain can supply credentials.
    const provider = process.env.VOICE_PROVIDER ?? "aws";
    return provider === "aws";
  },

  async transcribe(audio: Buffer, mimeType = "audio/webm") {
    return transcribeBatch(audio, mimeType);
  },

  async speak(text: string, opts: { languageCode?: string; speed?: number } = {}) {
    const c = await creds();
    const polly = new PollyClient({ region: REGION, credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey, sessionToken: c.sessionToken } });
    const engine = process.env.POLLY_ENGINE ?? "neural";
    const lang = (opts.languageCode ?? "en").slice(0, 2).toLowerCase();
    const voice = process.env.POLLY_VOICE_ID ?? TTS_VOICES[lang] ?? "Joanna";
    const speech = await polly.send(new SynthesizeSpeechCommand({
      OutputFormat: "mp3",
      Engine: engine as never,
      VoiceId: voice as never,
      Text: text.slice(0, 2000),
    }));
    if (!speech.AudioStream) throw new Error("Polly returned no audio");
    const bytes = await speech.AudioStream.transformToByteArray();
    return Buffer.from(bytes);
  },

  async realtimeGrant(languageCode = "en-US") {
    const c = await creds();
    const url = presignWebSocket({
      creds: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey, sessionToken: c.sessionToken },
      region: REGION,
      path: "/stream-transcription-websocket",
      params: { "language-code": languageCode, "media-encoding": "pcm", "sample-rate": "16000" },
    });
    return { token: url, modelId: languageCode };
  },
};
