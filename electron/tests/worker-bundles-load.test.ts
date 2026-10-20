// Last Updated: 2026-10-20

/**
 * Feature 90, Task 29 (FR-27, Stage 6.5 finding F-1): each built import worker
 * bundle must load under plain `node`, with no `server-only` alias and no
 * flags. F-1 measured `dist/docx-import-worker.cjs` and
 * `dist/scrivener-import-worker.cjs` throwing "This module cannot be imported
 * from a Client Component module" at load, from the `server-only` package.
 *
 * This test BUILDS the bundles first (`pnpm run build:worker`, in `beforeAll`),
 * so it needs no prior `build:worker` run and never loads a stale `dist/`.
 *
 * Plain `node` has no `process.parentPort` (Electron's `utilityProcess` supplies
 * it), and both workers call `process.parentPort.once(...)` at load. The only
 * thing supplied is that one stub, set in the `-e` bootstrap before the bundle
 * is `require`d; the bundle itself is loaded with no alias and no flags. The
 * bundle is never given a message, so no import runs and no projects or
 * app-data folder is touched.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const ELECTRON_DIR = path.resolve(__dirname, "..");
const BUNDLES = ["docx-import-worker.cjs", "scrivener-import-worker.cjs"];

/** Loads `bundlePath` in a fresh plain `node` process with only `parentPort` stubbed. */
function loadBundle(bundlePath: string): {
  status: number | null;
  stderr: string;
} {
  const bootstrap =
    "process.parentPort = { once() {}, postMessage() {} };" +
    `require(${JSON.stringify(bundlePath)});`;
  const result = spawnSync(process.execPath, ["-e", bootstrap], {
    cwd: ELECTRON_DIR,
    encoding: "utf8",
    timeout: 60_000,
  });
  return { status: result.status, stderr: result.stderr };
}

describe("built import worker bundles", () => {
  beforeAll(() => {
    const build = spawnSync("pnpm", ["run", "build:worker"], {
      cwd: ELECTRON_DIR,
      encoding: "utf8",
    });
    expect(build.status, build.stderr).toBe(0);
  }, 180_000);

  it.each(BUNDLES)("%s loads under plain node without throwing", (bundle) => {
    const bundlePath = path.join(ELECTRON_DIR, "dist", bundle);
    expect(existsSync(bundlePath)).toBe(true);

    const { status, stderr } = loadBundle(bundlePath);

    expect(stderr).not.toContain("cannot be imported from a Client Component");
    expect(stderr).toBe("");
    expect(status).toBe(0);
  });
});
