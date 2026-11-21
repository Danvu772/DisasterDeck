// #16 phone check (tests/phone.spec.ts), the one CI runs. Unlike playwright.config.ts it
// starts its own server: `next start` on a production build, port 3101, no database.
// Build first in the repo root (`npx next build`). Locally, CHROME_PATH=/usr/bin/google-chrome
// uses an installed Chrome instead of Playwright's download.
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PHONE_PORT ?? 3101);

export default defineConfig({
  testDir: "tests",
  testMatch: /phone\.spec\.ts/,
  outputDir: "test-results/phone",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 2,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "report/phone" }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    headless: true,
    screenshot: "on",
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: process.env.CHROME_PATH || undefined,
      args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
    },
  },
  projects: [{ name: "phone", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    // No database: the screens fall back to their demo data, the shell still renders.
    command: `npx next start -p ${PORT}`,
    cwd: "..",
    url: `http://127.0.0.1:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DEMO_MODE: "1",
      AUTH_SECRET: process.env.AUTH_SECRET ?? "ci-build-placeholder-not-a-secret",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
