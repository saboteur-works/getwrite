#!/usr/bin/env node
/**
 * Writes one SYNTHETIC GetWrite sample project for manual testing (Feature 121,
 * Task 9; POS task_23e9c7df). All names and text are generated; nothing is read
 * from or written to the repo's `projects/` unless `--out` points there.
 *
 * Usage: node scripts/sample-project/generate.mjs --out <dir> [--seed <int>]
 *
 * The project lands in `<dir>/<projectId>/` (the directory name is the project's
 * UUID, as the loader expects). The project id and every id the app's core
 * functions draw follow the seed, so the same seed gives the same ids and text
 * (timestamps come from the clock). The default seed is 121, the feature number.
 * A project directory that already holds files is refused before any write.
 * `project.json` carries `rootPath` (the absolute project directory), so the
 * Start page can open it. Prints one JSON line: path, project id, seed, counts.
 *
 * How it builds (decision in specs/features/merge-documents/experiments/task-8.md):
 * this wrapper bundles `driver.ts` with the declared `cli` esbuild into an OS
 * temp directory and runs the bundle with plain node. The driver calls the real
 * core functions, so the output stays schema-valid as the app changes.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const DEFAULT_SEED = 121;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");

function parseSeed(raw) {
  const n = Number(raw);
  if (!/^-?\d+$/.test(String(raw)) || !Number.isSafeInteger(n)) {
    throw new Error(`--seed must be an integer, got "${raw}"`);
  }
  return n;
}

function bundleDriver(workDir) {
  const empty = path.join(workDir, "empty.cjs");
  writeFileSync(empty, "module.exports = {};\n");
  const outfile = path.join(workDir, "driver.cjs");
  const esbuild = path.join(
    REPO_ROOT,
    "cli",
    "node_modules",
    ".bin",
    "esbuild",
  );
  execFileSync(
    esbuild,
    [
      path.join(HERE, "driver.ts"),
      "--bundle",
      "--platform=node",
      "--target=node20",
      "--format=cjs",
      `--tsconfig=${path.join(REPO_ROOT, "cli", "tsconfig.json")}`,
      `--alias:server-only=${empty}`,
      "--external:playwright",
      "--external:playwright-core",
      "--external:chromium-bidi",
      "--log-level=error",
      `--outfile=${outfile}`,
    ],
    { stdio: ["ignore", "ignore", "inherit"], cwd: REPO_ROOT },
  );
  return outfile;
}

function main() {
  const { values } = parseArgs({
    options: {
      out: { type: "string" },
      seed: { type: "string", default: String(DEFAULT_SEED) },
    },
  });
  if (!values.out) {
    throw new Error("usage: generate.mjs --out <dir> [--seed <int>]");
  }
  const seed = parseSeed(values.seed);
  const out = path.resolve(values.out);

  const workDir = mkdtempSync(path.join(os.tmpdir(), "gw-sample-driver-"));
  try {
    const bundle = bundleDriver(workDir);
    const run = spawnSync(
      process.execPath,
      [bundle, "--out", out, "--seed", String(seed)],
      { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8" },
    );
    if (run.status !== 0) {
      process.exitCode = run.status ?? 1;
      return;
    }
    process.stdout.write(run.stdout);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `generate: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
