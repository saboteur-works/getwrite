import { defineConfig } from "vitest/config";
import path from "node:path";

// Minimal, static vitest config to avoid loading ESM-only dependencies at
// config-evaluation time (resolves an ERR_REQUIRE_ESM startup issue).
//
// The suite is split into two projects by environment. Measured on 2026-09-16:
// constructing a jsdom instance for every file cost ~20s of wall time, because
// 274 of the 409 test files never touch the DOM at all. Running those under the
// `node` environment took the same 274 files from 51.9s to 32.3s, with the
// summed `environment` figure dropping from 206.7s to 27ms.
//
// The split is by extension, not by a hand-maintained file list: `.test.tsx`
// renders components and gets jsdom; `.test.ts` gets node. A `.test.ts` that
// does need a DOM (five do today — `DOMParser` and friends) opts back in with
// a docblock at the top of the file, which Vitest honours over the project's
// own setting:
//
//     /** @vitest-environment jsdom */
//
// That keeps the decision next to the code that needs it, so a new DOM-using
// `.test.ts` is one line away from correct rather than a config edit. Without
// it the failure is a clear `document is not defined`.
const shared = {
  globals: true,
  setupFiles: ["./tests/setup.ts"],
  exclude: [
    "**/e2e/**",
    "playwright-report/**",
    "node_modules/**",
    ".next/**",
    // ADR-021 Phase 2: build-native-static.mjs's generated shadow build
    // root symlinks node_modules/ in (and copies app/, next.config.mjs,
    // etc.) so `next build` can run against it — none of that is source,
    // and its own `node_modules` symlink would otherwise pull vendored
    // packages' own test suites (e.g. zod's) into this run.
    ".native-build/**",
    "out/**",
  ],
};

export default defineConfig({
  resolve: { alias: { "@": path.resolve(process.cwd(), "frontend", "@") } },
  test: {
    projects: [
      {
        resolve: {
          alias: { "@": path.resolve(process.cwd(), "frontend", "@") },
        },
        test: {
          ...shared,
          name: "node",
          environment: "node",
          include: ["**/*.test.ts"],
        },
      },
      {
        resolve: {
          alias: { "@": path.resolve(process.cwd(), "frontend", "@") },
        },
        test: {
          ...shared,
          name: "jsdom",
          environment: "jsdom",
          include: ["**/*.test.tsx"],
        },
      },
    ],
  },
});
