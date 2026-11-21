// Picks the voice provider from VOICE_PROVIDER (aws | elevenlabs, default aws) and returns its port.
// The default is Amazon Transcribe + Polly; ElevenLabs stays behind the same port for the
// "ElevenLabs for Government" fallback (§4.5, D-0005).

import type { VoicePort } from "./port";
import { awsPort } from "./aws";
import { elevenlabsPort } from "./elevenlabs";

export type { Transcript, RealtimeGrant, VoicePort } from "./port";

const PORTS: Record<VoicePort["name"], VoicePort> = { aws: awsPort, elevenlabs: elevenlabsPort };

export function providerName(): VoicePort["name"] {
  return process.env.VOICE_PROVIDER === "elevenlabs" ? "elevenlabs" : "aws";
}

export function voicePort(): VoicePort {
  return PORTS[providerName()];
}

/** For GET /api/health: which provider and (for AWS) which Polly voice. No credentials. */
export function voiceInfo(): { provider: VoicePort["name"]; pollyVoice: string } {
  return { provider: providerName(), pollyVoice: process.env.POLLY_VOICE_ID ?? "Joanna" };
}
