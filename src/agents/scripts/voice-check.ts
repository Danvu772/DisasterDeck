// ElevenLabs round trip: text → speech (saved as an mp3) → text again. Needs ELEVENLABS_API_KEY.
//   npx tsx --env-file=.env.local agents/scripts/voice-check.ts
// Uses about 200 characters of TTS credit and a few seconds of speech-to-text.

import { writeFileSync } from "node:fs";
import { speak, transcribe, voiceEnabled } from "../shared/voice";

async function main() {
  if (!voiceEnabled()) throw new Error("ELEVENLABS_API_KEY is not set in .env.local");
  const lines: [string, string][] = [
    ["en", "Aftershock warning. Magnitude six, forty kilometres away, two minutes ago. Get out of damaged buildings."],
    ["tr", "Ayşe'ye ulaştık, bacağı sıkışmış. On battaniye ve bir doktor lazım."],
  ];
  for (const [lang, line] of lines) {
    const t0 = Date.now();
    const mp3 = await speak(line, { languageCode: lang });
    const file = `agents/.usage/voice-check-${lang}.mp3`;
    writeFileSync(file, mp3);
    const t1 = Date.now();
    const back = await transcribe(mp3, "audio/mpeg");
    console.log(`\n[${lang}] said:  ${line}`);
    console.log(`[${lang}] heard: ${back.text}  (language ${back.languageCode}, ${((t1 - t0) / 1000).toFixed(1)} s to speak, ${((Date.now() - t1) / 1000).toFixed(1)} s to hear)`);
    console.log(`[${lang}] audio: ${file} (${Math.round(mp3.length / 1024)} KB) — open it to listen`);
  }
}

main().catch((e) => { console.error((e as Error).message); process.exit(1); });
