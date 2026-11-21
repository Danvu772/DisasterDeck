// SigV4, the small part we need: a presigned WebSocket URL for Transcribe streaming and a signed
// request header set for Polly. node:crypto only, no AWS SDK types. Used solely by aws.ts.
// Both derive from the default credential chain; a session token (task role) rides along when present.

import { createHash, createHmac } from "node:crypto";

export interface AwsCreds { accessKeyId: string; secretAccessKey: string; sessionToken?: string }

const hmac = (key: Buffer | string, data: string) => createHmac("sha256", key).update(data).digest();
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const iso = (d: Date) => d.toISOString().replace(/[:\-]|\.\d{3}/g, "");
const stamp = (d: Date) => iso(d).slice(0, 8);
const enc = (s: string) => encodeURIComponent(s);
const encPath = (p: string) => p.replace(/[^A-Za-z0-9\-._~\/]/g, (c) => encodeURIComponent(c));
const canonicalQuery = (params: Record<string, string>) =>
  Object.keys(params).sort().map((k) => `${enc(k)}=${enc(params[k])}`).join("&");

function signingKey(creds: AwsCreds, region: string, service: string, d: Date): Buffer {
  return hmac(hmac(hmac(hmac(`AWS4${creds.secretAccessKey}`, stamp(d)), region), service), "aws4_request");
}

/**
 * A presigned WebSocket URL the browser opens with `new WebSocket(url)` and writes raw 16-bit PCM
 * audio-event frames to. Service `transcribe`, host `transcribestreaming.<region>.amazonaws.com`.
 */
export function presignWebSocket(opts: {
  creds: AwsCreds; region: string; path: string; params: Record<string, string>; expires?: number; service?: string;
}): string {
  const { creds, region, path, params, expires = 900, service = "transcribe" } = opts;
  const now = new Date();
  const host = `transcribestreaming.${region}.amazonaws.com`;
  const isoDate = iso(now);
  const credential = `${creds.accessKeyId}/${stamp(now)}/${region}/${service}/aws4_request`;

  const query: Record<string, string> = {
    ...params,
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": credential,
    "X-Amz-Date": isoDate,
    "X-Amz-Expires": String(expires),
    "X-Amz-SignedHeaders": "host",
  };
  if (creds.sessionToken) query["X-Amz-Security-Token"] = creds.sessionToken;

  const q = canonicalQuery(query);
  const canonicalRequest = ["GET", encPath(path), q, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", isoDate, `${stamp(now)}/${region}/${service}/aws4_request`, sha256(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", signingKey(creds, region, service, now)).update(stringToSign).digest("hex");

  return `wss://${host}${path}?${q}&X-Amz-Signature=${signature}`;
}

/** Authorization + host headers for a plain REST call (Polly SynthesizeSpeech). Service `polly`. */
export function signRequest(opts: {
  method: string; creds: AwsCreds; region: string; path: string; query: string; body: Uint8Array;
}): Record<string, string> {
  const { method, creds, region, path, query, body } = opts;
  const service = "polly";
  const now = new Date();
  const isoDate = iso(now);
  const host = `polly.${region}.amazonaws.com`;
  const payloadHash = sha256(Buffer.from(body).toString("latin1"));
  const canonicalRequest = [method, encPath(path), query, `host:${host}\n`, "host", payloadHash].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", isoDate, `${stamp(now)}/${region}/${service}/aws4_request`, sha256(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", signingKey(creds, region, service, now)).update(stringToSign).digest("hex");
  const credential = `${creds.accessKeyId}/${stamp(now)}/${region}/${service}/aws4_request`;
  const out: Record<string, string> = {
    host,
    "x-amz-date": isoDate,
    authorization: `AWS4-HMAC-SHA256 Credential=${credential}, SignedHeaders=host, Signature=${signature}`,
  };
  if (creds.sessionToken) out["x-amz-security-token"] = creds.sessionToken;
  return out;
}
