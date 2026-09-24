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
  // Runs against a BUILT Storybook, not `storybook dev`. Measured 2026-09-23,
  // three consecutive full runs in each mode with `--retries=0`:
  //
  //   against `storybook dev`     16, 38, 12 failures  (41 tests nondeterministic)
  //   against the built output     7,  7,  7 failures  ( 0 tests nondeterministic)
  //
  // The same 7 tests fail either way. Everything above that was the dev
  // server compiling each story on first request, where a cold compile
  // regularly exceeds the 5s timeouts below — the extra failures were
  // overwhelmingly `locator.click: Timeout` and `toBeVisible()`, not wrong
  // values. The build costs ~30s up front and buys a suite whose failures
  // mean something.
  webServer: {
    command:
      "pnpm run build-storybook && node scripts/serve-storybook-static.mjs",
    port: 6006,
    reuseExistingServer: true,
    timeout: 300_000,
  },
});
