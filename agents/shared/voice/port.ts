// The voice port: one narrow interface in front of every speech-to-text / text-to-speech vendor
// (§4.5, invariant 8). Routes and components import only agents/shared/voice.ts, which re-exports the
// chosen provider through voicePort(). Swapping a vendor changes one VOICE_PROVIDER value, never a
// route or a component.

export interface Transcript { text: string; languageCode?: string; confidence?: number }

/** The live streaming grant. `token` is what the browser streams to: a presigned WebSocket URL
 * (AWS Transcribe) or a single-use bearer token for the vendor's own endpoint (ElevenLabs).
 * `modelId` is the language code (AWS) or the realtime model id (ElevenLabs). */
export interface RealtimeGrant { token: string; modelId: string }

export interface VoicePort {
  name: "aws" | "elevenlabs";
  enabled(): boolean;
  transcribe(audio: Buffer, mimeType?: string): Promise<Transcript>;
  speak(text: string, opts?: { languageCode?: string; speed?: number }): Promise<Buffer>;
  realtimeGrant(languageCode?: string): Promise<RealtimeGrant>;
}
