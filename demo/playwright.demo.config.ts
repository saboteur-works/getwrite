import { defineConfig } from "@playwright/test";

// Dedicated config for the LinkedIn demo walkthrough. Kept separate from the
// e2e suite so it never runs in CI: it drives the live dev app on :3000 (not
// Storybook), records full video, and is paced for human viewing.
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  timeout: 240_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: "./out/raw",
  use: {
    baseURL: "http://localhost:3000",
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2, // crisp 2x capture
    video: { mode: "on", size: { width: 1440, height: 900 } },
    trace: "off",
    screenshot: "off",
  },
  webServer: {
    command: "pnpm --filter getwrite-frontend dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
    cwd: "..",
  },
});
