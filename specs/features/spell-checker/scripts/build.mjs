// Spike bundler (Feature 95, Task 7; FR-2). Bundles the driver page and one worker
// per engine with esbuild (already in the workspace, android/node_modules; precedent
// android/scripts/build-harness.mjs). Output goes OUTSIDE the tracked tree.
// No application module is imported.
//
// Run: node specs/features/spell-checker/scripts/build.mjs [--out DIR]
//   default DIR: $TMPDIR/spell-spike-bundle
//
// Output layout:
//   driver.html, driver.bundle.js
//   worker-nspell.js            classic worker (iife)
//   worker-harper.js            module worker (esm; harper.js uses import.meta.url)
//   harper_wasm_bg.wasm, harper_wasm_slim_bg.wasm   next to worker-harper.js, because
//        harper.js resolves them with new URL("harper_wasm_bg.wasm", import.meta.url)
//        and esbuild leaves that expression as is. harper's full flavour also loads
//        the slim wasm first (getDefaultGlueBinary), so both files are copied.
//   assets/index.aff, assets/index.dic   dictionary-en data, fetched by worker-nspell
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
const nodeModules = resolve(repoRoot, "frontend/node_modules");
const require = createRequire(resolve(repoRoot, "android/package.json"));
const { build } = require("esbuild");

// Extra control messages (prefix "__") answered by the wrapper; everything else goes
// to the protocol handler installed by the engine worker.
const wrapperSource = (workerPath) => `
import ${JSON.stringify(workerPath)};
const inner = self.onmessage;
async function control(d) {
  const reply = { type: "__reply", ctl: d.ctl };
  if (d.type === "__resources") {
    reply.entries = performance.getEntriesByType("resource").map((e) => ({
      name: e.name, transferSize: e.transferSize, encodedBodySize: e.encodedBodySize, decodedBodySize: e.decodedBodySize,
    }));
  } else if (d.type === "__memory") {
    const m = performance.memory;
    reply.jsHeapUsed = m ? m.usedJSHeapSize : null;
    reply.jsHeapTotal = m ? m.totalJSHeapSize : null;
    reply.crossOriginIsolated = self.crossOriginIsolated === true;
    reply.uaSpecificBytes = null;
    reply.uaSpecificError = null;
    if (d.uas) {
      if (typeof performance.measureUserAgentSpecificMemory !== "function") reply.uaSpecificError = "measureUserAgentSpecificMemory is not available in the worker";
      else try { reply.uaSpecificBytes = (await performance.measureUserAgentSpecificMemory()).bytes; } catch (e) { reply.uaSpecificError = String(e); }
    }
  } else reply.error = "unknown control message " + d.type;
  self.postMessage(reply);
}
self.onmessage = (event) => {
  const d = event.data;
  if (d && typeof d.type === "string" && d.type.startsWith("__")) control(d);
  else inner(event);
};
`;

const common = { bundle: true, platform: "browser", logLevel: "info", legalComments: "none", define: { "process.env.NODE_ENV": '"production"' } };

export async function buildBundle(out) {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, "assets"), { recursive: true });
  await build({ ...common, entryPoints: [join(here, "driver.mjs")], format: "iife", target: "chrome80", outfile: join(out, "driver.bundle.js") });
  for (const [engine, format, target] of [["nspell", "iife", "chrome67"], ["harper", "esm", "chrome80"]]) {
    await build({
      ...common,
      stdin: { contents: wrapperSource(`./worker-${engine}.mjs`), resolveDir: here, sourcefile: `wrapper-${engine}.mjs`, loader: "js" },
      format,
      target,
      external: ["fs"], // harper.js reaches for "fs" only under Node (file:// URLs); never run in a browser
      outfile: join(out, `worker-${engine}.js`),
    });
  }
  copyFileSync(join(here, "driver.html"), join(out, "driver.html"));
  for (const f of ["harper_wasm_bg.wasm", "harper_wasm_slim_bg.wasm"]) copyFileSync(join(nodeModules, "harper.js/dist", f), join(out, f));
  for (const f of ["index.aff", "index.dic"]) copyFileSync(join(nodeModules, "dictionary-en", f), join(out, "assets", f));
}

export const defaultBundleDir = () => join(process.env.TMPDIR ?? tmpdir(), "spell-spike-bundle");

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const out = resolve(args.includes("--out") ? args[args.indexOf("--out") + 1] : defaultBundleDir());
  await buildBundle(out);
  console.log(`bundle written to ${out}`);
}
