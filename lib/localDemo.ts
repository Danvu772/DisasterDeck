// Is this request from this laptop, with DEMO_MODE=1? Only then do the demo shortcuts work
// (?user=, body.userId, the open board and the ungated pages). Owner: Role 1 (#11).
// Headers and host only, no database: middleware.ts (edge runtime) imports this too.
//
// Next fills x-forwarded-for with the socket address and x-forwarded-host with Host on every
// request it serves (base-server.js, `??=`), so those two are allowed when they still say
// "this machine". A tunnel or proxy sets them first, to the real client, so Next keeps those.
// The headers Next never adds must be absent.

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];
const LOOPBACK = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];
const PROXY_ONLY = ["x-real-ip", "cf-connecting-ip", "forwarded"];

/** "localhost:3000" to "localhost", "[::1]:3000" to "[::1]". */
function hostName(host: string): string {
  const h = host.trim().toLowerCase();
  return h.startsWith("[") ? h.slice(0, h.indexOf("]") + 1) : h.split(":")[0];
}

/** A LAN address: a phone on the same Wi-Fi reaching a DEMO_TRUSTED_HOSTS name. */
function isPrivate(ip: string): boolean {
  const v4 = ip.replace(/^::ffff:/, "");
  return LOOPBACK.includes(ip) || /^10\./.test(v4) || /^192\.168\./.test(v4)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(v4) || /^f[cd]/i.test(ip) || /^fe80:/i.test(ip);
}

export function isLocalDemo(req: { headers: Headers; url: string }): boolean {
  if (process.env.DEMO_MODE !== "1") return false;
  const h = req.headers;
  if (PROXY_ONLY.some((name) => h.has(name))) return false;

  const trusted = (process.env.DEMO_TRUSTED_HOSTS ?? "").split(",").map(hostName).filter(Boolean);
  const host = hostName(h.get("host") ?? new URL(req.url).host);
  const local = LOCAL_HOSTS.includes(host);
  if (!local && !trusted.includes(host)) return false;

  const fwdHost = h.get("x-forwarded-host");
  if (fwdHost !== null && hostName(fwdHost) !== host) return false;

  const fwdFor = h.get("x-forwarded-for");
  if (fwdFor !== null) {
    const ips = fwdFor.split(",").map((s) => s.trim());
    if (ips.length !== 1) return false; // a proxy chain
    if (local ? !LOOPBACK.includes(ips[0]) : !isPrivate(ips[0])) return false;
  }
  return true;
}
