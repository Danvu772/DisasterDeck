// The voice port (D-0005, §4.5): speech to text and text to speech for the people who cannot type —
// a field team in the rubble, a supplier driving. This module is the single interface everything else
// imports; the actual provider lives behind it (agents/shared/voice/). Default is Amazon Transcribe +
// Polly on the task role; VOICE_PROVIDER=elevenlabs keeps Scribe + TTS for ElevenLabs for Government.
//
// Coverage (checked 17 Nov 2026): Amazon Transcribe and Polly are GA for English and Spanish (as well
// as Turkish). Field dictation is on-device only (components/field/useDictation.ts, processLocally),
// never Google's cloud path; the server-side STT/TTS here runs only for /talk and voice notes.

import { voicePort } from "./voice/index";

export interface Transcript { text: string; languageCode?: string; confidence?: number }

export function voiceEnabled(): boolean {
  return voicePort().enabled();
}

/** The live speech-to-text id: a Transcribe language code (aws) or a Scribe model (elevenlabs). */
export const LIVE_STT_MODEL =
  process.env.VOICE_PROVIDER === "elevenlabs"
    ? process.env.ELEVENLABS_STT_LIVE_MODEL ?? "scribe_v3_live"
    : process.env.VOICE_LIVE_LANGUAGE ?? "en-US";

/** Audio (webm/opus from a phone browser, m4a, mp3, wav) → text, through the chosen provider. */
export async function transcribe(audio: Buffer, mimeType = "audio/webm"): Promise<Transcript> {
  return voicePort().transcribe(audio, mimeType);
}

/** Text → MP3. Short replies only: the agent's answers are one to three sentences. */
export async function speak(text: string, opts: { languageCode?: string; speed?: number } = {}): Promise<Buffer> {
  return voicePort().speak(text, opts);
}

/**
 * What the browser streams the microphone to for live transcription on /talk. AWS: a presigned
 * WebSocket URL straight to Transcribe streaming (the task role's short-lived credential, so no key
 * ever leaves the server). ElevenLabs: a single-use token for Scribe realtime.
 */
export async function realtimeToken(languageCode?: string): Promise<string> {
  const grant = await voicePort().realtimeGrant(languageCode ?? LIVE_STT_MODEL);
  return grant.token;
}
