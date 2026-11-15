// Headless workflow tests against the dev server that already runs (tmux dd:dev).
// Every test leaves a video, screenshots and a trace in test-results/, plus an HTML report in report/.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  outputDir: "test-results",
  // The dev server compiles a page on its first hit, so the first test of a page can take a while.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: 3,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "report" }]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://127.0.0.1:3000",
    // Always headless. No window may ever open on Dan's screen (rule in ~/.claude/CLAUDE.md).
    // The video, screenshots and trace are how you watch a run afterwards.
    headless: true,
    video: "on",
    screenshot: "on",
    trace: "on",
    // The maps are MapLibre (WebGL). Headless Chrome only gives WebGL through SwiftShader when asked.
    launchOptions: { args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] },
  },
  projects: [
    {
      name: "laptop",
      testIgnore: /field(-voice)?\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "phone",
      testMatch: /field(-voice)?\.spec\.ts/,
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
    },
  ],
});
