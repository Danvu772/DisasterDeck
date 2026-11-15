import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
if (process.env.DESK_ID && process.env.DESK_ID !== "antakya-2023") {
  console.error("This checkout uses Antakya. Set DESK_ID=antakya-2023 in your environment / .env.local and restart all workers.");
  process.exit(1);
}
const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, DEMO_MODE: "1", DESK_ID: "antakya-2023",
    AUTH_SECRET: process.env.AUTH_SECRET || randomBytes(32).toString("hex"),
    SSOJET_ISSUER_URL: process.env.SSOJET_ISSUER_URL || "http://127.0.0.1:3000/unused-demo-issuer" },
});
child.on("error", error => { console.error(error.message); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
