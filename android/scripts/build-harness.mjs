// ADR-021 Phase 0 — builds the on-device verification harness into a single,
// WebView-loadable IIFE bundle at `android/www/harness.bundle.js`.
//
// Why a dedicated tiny bundler instead of the frontend's Next build: the harness
// deliberately runs OUTSIDE the app UI (Phase 2 territory), as a self-contained
// page dropped into Capacitor's `webDir` (`www/`). It pulls the native seams
// (native-bootstrap + native-device-harness) and their transitive model/search
// graph into one file that runs in the WebView against the real
// @capacitor/filesystem plugin.
//
// Node built-ins the model layer imports don't exist in a WebView, so they are
// aliased to the POSIX/shim implementations under `harness/shims/`:
//   - node:path / path        -> a faithful POSIX path port (join/dirname/normalize/posix)
//   - node:async_hooks        -> AsyncLocalStorage whose getStore() returns undefined
//                                (native uses the module-scoped default context, Task 4)
//   - node:fs / fs            -> a throwing stub (never called on the native path)
//
// The build inlines NEXT_PUBLIC_GETWRITE_RUNTIME="native" so the transport seam
// dispatches in-process (no fetch) exactly as a real native build would.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const androidRoot = resolve(here, "..");
const shims = resolve(androidRoot, "harness", "shims");

const shimPath = (name) => resolve(shims, name);

// Feature 95 (spell checker) Part 0, Task 9 (FR-8, FR-10): `--spell-spike` builds the
// spell-checker spike into `android/build/spell-spike/` (gitignored) instead of the
// harness bundle, so the spike runs in the real Capacitor WebView. Point Capacitor's
// webDir at that folder to load it (see specs/features/spell-checker/experiments.md,
// "Owner step: Android"). The default harness build below is unchanged.
if (process.argv.includes("--spell-spike")) {
  const spike = resolve(
    androidRoot,
    "..",
    "specs/features/spell-checker/scripts",
  );
  const out = resolve(androidRoot, "build", "spell-spike");
  const { buildBundle } = await import(resolve(spike, "build.mjs"));
  const { prepareFixtures, environmentRecord } = await import(
    resolve(spike, "serve.mjs")
  );
  await buildBundle(out);
  await prepareFixtures(resolve(out, "fixtures"));
  writeFileSync(resolve(out, "env.json"), JSON.stringify(environmentRecord()));
  await build({
    entryPoints: [resolve(androidRoot, "harness", "spell-spike-entry.ts")],
    bundle: true,
    platform: "browser",
    format: "iife",
    target: ["es2015"],
    outfile: resolve(out, "persist.bundle.js"),
    logLevel: "info",
    define: { "process.env.NODE_ENV": '"production"' },
    banner: {
      js: "if(typeof globalThis==='undefined'){window.globalThis=window;}",
    },
  });
  for (const f of ["index.html", "storage-check.html"]) {
    copyFileSync(
      resolve(androidRoot, "harness", "spell-spike", f),
      resolve(out, f),
    );
  }
  const driver = resolve(out, "driver.html");
  writeFileSync(
    driver,
    readFileSync(driver, "utf8").replace(
      "</body>",
      '<p id="persist-status">waiting for the result</p>\n<script src="persist.bundle.js"></script>\n</body>',
    ),
  );
  console.log(
    `[build-harness] wrote ${out} (spell-spike). Set webDir to build/spell-spike, then sync.`,
  );
  process.exit(0);
}

await build({
  entryPoints: [resolve(androidRoot, "harness", "harness-entry.ts")],
  bundle: true,
  platform: "browser",
  format: "iife",
  // es2015 keeps native `class extends Uint8Array` (es5 would break the Buffer
  // shim) while transpiling newer syntax down, so the bundle also parses on the
  // old WebView (~Chrome 51) that ships with the minSdk=24 emulator image.
  target: ["es2015"],
  outfile: resolve(androidRoot, "www", "harness.bundle.js"),
  sourcemap: true,
  logLevel: "info",
  // Statically inline the native runtime flag so resolveSearchTransport() picks
  // the in-process backend, and quiet framework dev-only process.env reads.
  define: {
    "process.env.NEXT_PUBLIC_GETWRITE_RUNTIME": '"native"',
    "process.env.NODE_ENV": '"production"',
  },
  // Node's global `Buffer` doesn't exist in a WebView; the storage adapter uses
  // it for all base64 read/write. Inject a dependency-free Buffer polyfill as
  // the free `Buffer` identifier across every bundled module. See buffer-inject.mjs.
  inject: [shimPath("buffer-inject.mjs")],
  // Old WebViews (e.g. Chrome 53 on the minSdk=24 emulator) predate `globalThis`
  // (Chrome 71), so polyfill it from `window` first — otherwise the very first
  // banner statement throws ReferenceError and the whole bundle fails to load.
  // Then install a minimal `process` so any stray `process.env.X` read returns
  // undefined rather than throwing.
  banner: {
    js: "if(typeof globalThis==='undefined'){window.globalThis=window;}globalThis.process=globalThis.process||{env:{}};",
  },
  alias: {
    "node:path": shimPath("path.mjs"),
    path: shimPath("path.mjs"),
    "node:async_hooks": shimPath("async_hooks.mjs"),
    async_hooks: shimPath("async_hooks.mjs"),
    "node:fs/promises": shimPath("fs-promises.mjs"),
    "fs/promises": shimPath("fs-promises.mjs"),
    "node:fs": shimPath("fs.mjs"),
    fs: shimPath("fs.mjs"),
  },
});

console.log(
  "[build-harness] wrote android/www/harness.bundle.js (+ .map). Run `pnpm --filter getwrite-android sync` after `cap add android` to copy it into the native project.",
);
