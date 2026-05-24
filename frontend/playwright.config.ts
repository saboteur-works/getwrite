import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.spec.ts",
  timeout: 30_000,
  expect: { timeout: 5000 },
  // Spec files run across parallel workers, so real-input tests (e.g. wheel
  // scrolling) can flake under CPU contention even when the behaviour is
  // correct. A couple of retries keeps the suite reliable without masking
  // genuine failures, which fail on every attempt.
  retries: 2,
  fullyParallel: false,
  reporter: [["list"], ["html", { open: "never" }]],
  // Store artifacts in a dedicated directory and enable capture of
  // screenshots, video and trace so CI can collect debugging data.
  outputDir: "playwright-report",
  use: {
    actionTimeout: 5000,
    // Capture artifacts for every test run (can be adjusted to
    // 'only-on-failure' / 'retain-on-failure' to reduce storage).
    screenshot: "on",
    video: "on",
    trace: "on",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm run storybook",
    port: 6006,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
