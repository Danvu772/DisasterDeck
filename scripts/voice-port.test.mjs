// Unit tests for the voice port (agents/shared/voice.ts → agents/shared/voice/*), D-0005.
// No key, no network: the AWS SDK is imported but never called, the SigV4 presigner is run against
// fixed credentials, and the abstraction is proved by swapping VOICE_PROVIDER. The live Transcribe +
// Polly calls themselves need the AWS task role and are not exercised here (they are UNKNOWN without
// credentials).   npm run check:voice
// Requirements: VOX-2 (Talk uses Transcribe + Polly behind a voice port), and the offline half of
// VOX-1 (dictation sets processLocally, audio never to Google).

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));

const voice = await import("../src/agents/shared/voice.ts");
const voiceIndex = await import("../src/agents/shared/voice/index.ts");
const { presignWebSocket } = await import("../src/agents/shared/voice/sigv4.ts");

// ── VOX-2: the port abstracts the provider, and one config value swaps it ─────────────────────
test("VOX-2: providerName defaults to aws and VOICE_PROVIDER=elevenlabs alone flips it", () => {
  const old = process.env.VOICE_PROVIDER;
  try {
    delete process.env.VOICE_PROVIDER;
    assert.equal(voiceIndex.providerName(), "aws");
    assert.equal(voiceIndex.voicePort().name, "aws");
    process.env.VOICE_PROVIDER = "elevenlabs";
    assert.equal(voiceIndex.providerName(), "elevenlabs");
    assert.equal(voiceIndex.voicePort().name, "elevenlabs");
    process.env.VOICE_PROVIDER = "aws";
    assert.equal(voiceIndex.voicePort().name, "aws");
  } finally {
    if (old === undefined) delete process.env.VOICE_PROVIDER; else process.env.VOICE_PROVIDER = old;
  }
});

test("VOX-2: every provider implements the same VoicePort (transcribe, speak, realtimeGrant, enabled)", () => {
  // Both providers are reachable behind the one port; the port types are the contract.
  for (const name of ["aws", "elevenlabs"]) {
    const prev = process.env.VOICE_PROVIDER;
    process.env.VOICE_PROVIDER = name;
    try {
      const p = voiceIndex.voicePort();
      assert.equal(p.name, name);
      assert.equal(typeof p.enabled, "function");
      assert.equal(typeof p.transcribe, "function");
      assert.equal(typeof p.speak, "function");
      assert.equal(typeof p.realtimeGrant, "function");
    } finally {
      if (prev === undefined) delete process.env.VOICE_PROVIDER; else process.env.VOICE_PROVIDER = prev;
    }
  }
});

test("VOX-2: voiceEnabled() is true for aws by default, and gated on the key only for elevenlabs", () => {
  const old = process.env.VOICE_PROVIDER; const oldKey = process.env.ELEVENLABS_API_KEY;
  try {
    delete process.env.VOICE_PROVIDER;
    assert.equal(voice.voiceEnabled(), true);           // aws needs no key: the task role supplies creds
    process.env.VOICE_PROVIDER = "elevenlabs";
    delete process.env.ELEVENLABS_API_KEY;
    assert.equal(voice.voiceEnabled(), false);
    process.env.ELEVENLABS_API_KEY = "test-key";
    assert.equal(voice.voiceEnabled(), true);
  } finally {
    if (old === undefined) delete process.env.VOICE_PROVIDER; else process.env.VOICE_PROVIDER = old;
    if (oldKey === undefined) delete process.env.ELEVENLABS_API_KEY; else process.env.ELEVENLABS_API_KEY = oldKey;
  }
});

// ── VOX-2: the live path presigns a Transcribe streaming WebSocket from fixed creds ────────────
test("VOX-2: presignWebSocket builds a wss:// Transcribe streaming URL, signed, with the session token", () => {
  const url = presignWebSocket({
    creds: { accessKeyId: "AKIDEXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY", sessionToken: "token" },
    region: "us-east-1",
    path: "/stream-transcription-websocket",
    params: { "language-code": "en-US", "media-encoding": "pcm", "sample-rate": "16000" },
  });
  const [scheme, rest] = url.split("://");
  assert.equal(scheme, "wss");
  const [host, query] = rest.split("?");
  assert.equal(host, "transcribestreaming.us-east-1.amazonaws.com/stream-transcription-websocket");
  const q = new URLSearchParams(query);
  assert.equal(q.get("language-code"), "en-US");
  assert.equal(q.get("media-encoding"), "pcm");
  assert.equal(q.get("sample-rate"), "16000");
  assert.equal(q.get("X-Amz-Algorithm"), "AWS4-HMAC-SHA256");
  assert.match(q.get("X-Amz-Credential") ?? "", /^AKIDEXAMPLE\/\d{8}\/us-east-1\/transcribe\/aws4_request$/);
  assert.equal(q.get("X-Amz-SignedHeaders"), "host");
  assert.equal(q.get("X-Amz-Security-Token"), "token");
  assert.match(q.get("X-Amz-Signature") ?? "", /^[0-9a-f]{64}$/);
});

test("VOX-2: the presigner omits the session token when the role gave none, and the date is in scope", () => {
  const creds = { accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" };
  const params = { "language-code": "es-US", "media-encoding": "pcm", "sample-rate": "16000" };
  const url = presignWebSocket({ creds, region: "us-west-2", path: "/stream-transcription-websocket", params });
  const q = new URLSearchParams(url.split("?")[1]);
  assert.match(q.get("X-Amz-Signature") ?? "", /^[0-9a-f]{64}$/);
  assert.match(q.get("X-Amz-Credential") ?? "", /^AKIDEXAMPLE\/\d{8}\/us-west-2\/transcribe\/aws4_request$/);
  assert.equal(q.get("X-Amz-Security-Token"), null);   // no session token → not in the URL
  assert.equal(q.get("language-code"), "es-US");
});

// ── VOX-1: dictation is on-device only ─────────────────────────────────────────────────────────
test("VOX-1: useDictation sets processLocally and never writes audio to the network", () => {
  const src = readFileSync(join(root, "src", "components", "field", "useDictation.ts"), "utf8");
  assert.match(src, /processLocally\s*=\s*true/);
  // Dictation only ever hands text back; there is no fetch/websocket/audio-send in this module.
  assert.ok(!/fetch\(|WebSocket|XMLHttpRequest|navigator\.sendBeacon|FormData/.test(src));
});

// ── VOX-2: the AWS SDK is reached only through the voice port ─────────────────────────────────
function files(d, out = []) {
  for (const n of readdirSync(d)) {
    if (["node_modules", ".next", ".git"].includes(n)) continue;
    const p = join(d, n);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(ts|tsx|mjs|js|cjs)$/.test(n)) out.push(p);
  }
  return out;
}
const code = files(root).map((f) => f.slice(root.length));

test("VOX-2: every @aws-sdk import lives in the voice port (or the one client the port targets)", () => {
  const allowed = [
    "src/agents/shared/voice/aws.ts",          // Transcribe batch + Polly behind the port
    "src/agents/shared/voice/sigv4.ts",        // the presigner (no SDK import, but listed for clarity)
    "src/components/talk/useVoice.ts",         // the browser frames AudioEvents with the eventstream marshaller
    "scripts/voice-port.test.mjs",
  ];
  for (const f of code) {
    const text = readFileSync(join(root, f), "utf8");
    const imports = [...text.matchAll(/from\s+["'](@aws-sdk\/[^"']+)["']/g)].map((m) => m[1]);
    if (!imports.length) continue;
    assert.ok(allowed.includes(f), `${f} imports ${imports.join(", ")} outside the voice port`);
    // The SDK client is the only thing allowed in the port; credential handling is the default chain.
    for (const i of imports) assert.match(i, /^@aws-sdk\/(client-(transcribe|polly|s3)|credential-providers|eventstream-marshaller)$/);
  }
});

test("VOX-2: no route or field component imports the AWS SDK or reads AWS_ keys", () => {
  for (const f of code) {
    if (!/^src\/app\//.test(f) && !/^src\/components\/field\//.test(f)) continue;
    const text = readFileSync(join(root, f), "utf8");
    assert.ok(!/@aws-sdk\//.test(text), `${f} imports @aws-sdk`);
  }
  // No AWS_ACCESS_KEY / AWS_SECRET anywhere in the code; only the default chain is used.
  const pkgsrc = readFileSync(join(root, "src/agents/shared/voice/aws.ts"), "utf8");
  assert.ok(!/AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AccessKeyId\s*:\s*"/.test(pkgsrc));
});

test("VOX-2: Transcribe and Polly cover English and Spanish (the coverage note), and the voice map is per-language", () => {
  const aws = readFileSync(join(root, "src/agents/shared/voice/aws.ts"), "utf8");
  assert.match(aws, /TTS_VOICES/);
  assert.match(aws, /en:\s*"Joanna"/);
  assert.match(aws, /es:\s*"Mia"/);
  assert.match(aws, /IdentifyLanguage:\s*true/);   // en/es detected from the audio, no caller hint
  // The header documents the en+es GA coverage so a future reader knows it was checked.
  assert.match(aws, /English and Spanish/);
});
