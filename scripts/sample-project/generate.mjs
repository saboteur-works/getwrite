#!/usr/bin/env node
/**
 * Writes one SYNTHETIC GetWrite sample project for manual testing (Feature 121,
 * Task 9; POS task_23e9c7df). All names and text are generated; nothing is read
 * from or written to the repo's `projects/` unless `--out` points there.
 *
 * Usage: node scripts/sample-project/generate.mjs --out <dir> [--seed <int>]
 *          [--encrypted <passphrase-file>]
 *
 * The project lands in `<dir>/<projectId>/` (the directory name is the project's
 * UUID, as the loader expects). The project id and every id the app's core
 * functions draw follow the seed, so the same seed gives the same ids and text
 * (timestamps come from the clock). The default seed is 121, the feature number.
 * A project directory that already holds files is refused before any write.
 * `project.json` carries `rootPath` (the absolute project directory), so the
 * Start page can open it. Prints one JSON line: path, project id, seed, counts,
 * and `merge` (Task 10): the ids of the documents arranged for the merge checks
 * (cross-folder selection, annotated absorbed document, differing metadata,
 * empty document, compile-excluded and Inbox targets, refusal cases, an already
 * merged document, and 50 documents of about 5000 words for 2/10/50 timing).
 * The merged mark is hand-written through the real mark store; no merge ran.
 *
 * `--encrypted <passphrase-file>` (Task 11) also writes an encrypted copy of
 * the same project (same seed, same ids and text) in `<dir>-encrypted/`, a
 * workspace root of its own because the keyring file is written in the root.
 * The passphrase is read from the file (one line, a trailing newline dropped),
 * never from the command line, and is never printed. The JSON line then gains
 * `encrypted: { path, projectId, keyringFile }`; without the option the line
 * is unchanged. The copy opens only after unlocking the workspace with that
 * passphrase. Encryption is refused in hosted mode, which this script is not.
 *
 * How it builds (decision in specs/features/merge-documents/experiments/task-8.md):
 * this wrapper bundles `driver.ts` with the declared `cli` esbuild into an OS
 * temp directory and runs the bundle with plain node. The driver calls the real
 * core functions, so the output stays schema-valid as the app changes.
 */
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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

function readPassphraseFile(file) {
  let raw;
  try {
    raw = readFileSync(file, "utf8");
  } catch (error) {
    throw new Error(
      `cannot read the passphrase file: ${error instanceof Error ? (error.code ?? "error") : "error"}`,
    );
  }
  if (raw.replace(/\r?\n$/, "").length === 0) {
    throw new Error("the passphrase file is empty");
  }
}

function runDriver(bundle, out, seed, passphraseFile) {
  const args = [bundle, "--out", out, "--seed", String(seed)];
  if (passphraseFile) args.push("--passphrase-file", passphraseFile);
  return spawnSync(process.execPath, args, {
    stdio: ["ignore", "pipe", "inherit"],
    encoding: "utf8",
  });
}

function main() {
  const { values } = parseArgs({
    options: {
      out: { type: "string" },
      seed: { type: "string", default: String(DEFAULT_SEED) },
      encrypted: { type: "string" },
    },
  });
  if (!values.out) {
    throw new Error(
      "usage: generate.mjs --out <dir> [--seed <int>] [--encrypted <passphrase-file>]",
    );
  }
  const seed = parseSeed(values.seed);
  const out = path.resolve(values.out);
  const passphraseFile =
    values.encrypted === undefined ? null : path.resolve(values.encrypted);
  const encryptedOut = `${out}-encrypted`;
  if (passphraseFile !== null) {
    // Both refusals come before any write.
    readPassphraseFile(passphraseFile);
    if (existsSync(encryptedOut) && readdirSync(encryptedOut).length > 0) {
      throw new Error(`refusing to write into non-empty ${encryptedOut}`);
    }
  }

  const workDir = mkdtempSync(path.join(os.tmpdir(), "gw-sample-driver-"));
  try {
    const bundle = bundleDriver(workDir);
    const run = runDriver(bundle, out, seed, null);
    if (run.status !== 0) {
      process.exitCode = run.status ?? 1;
      return;
    }
    if (passphraseFile === null) {
      process.stdout.write(run.stdout);
      return;
    }
    const copy = runDriver(bundle, encryptedOut, seed, passphraseFile);
    if (copy.status !== 0) {
      rmSync(encryptedOut, { recursive: true, force: true });
      process.exitCode = copy.status ?? 1;
      return;
    }
    const plainLine = JSON.parse(run.stdout.trim());
    const encryptedLine = JSON.parse(copy.stdout.trim());
    plainLine.encrypted = encryptedLine.encrypted;
    process.stdout.write(`${JSON.stringify(plainLine)}\n`);
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
