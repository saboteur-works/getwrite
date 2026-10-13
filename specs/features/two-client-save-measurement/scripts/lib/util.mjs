/**
 * Feature 78 harness: small shared helpers (paths, clock, hashing).
 *
 * The host clock used everywhere is `hostNow()`: milliseconds since the epoch
 * with sub-millisecond resolution (performance.timeOrigin + performance.now()).
 * Every scripted client runs on one host, so they share this one clock. Times
 * recorded from Playwright events are event times in this process, not wire
 * times.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));
export const SCRIPTS_DIR = path.resolve(LIB_DIR, "..");
export const FEATURE_DIR = path.resolve(SCRIPTS_DIR, "..");
export const REPO = path.resolve(FEATURE_DIR, "../../..");
export const FRONTEND = path.join(REPO, "frontend");
export const RESULTS_DIR = path.join(FEATURE_DIR, "results");

/**
 * The file a S2 summary names for one repetition. The summary stores either an
 * absolute path (older runs, written on the machine that ran them) or a path
 * relative to RESULTS_DIR (newer runs); either way the file is looked up first
 * by its basename under RESULTS_DIR/s2, so a checkout in another location still
 * reads it, and the stored value is only the fallback. Returns null when no
 * such file exists.
 */
export function resolveRepFile(stored) {
  if (!stored) return null;
  const byName = path.join(RESULTS_DIR, "s2", path.basename(stored));
  if (existsSync(byName)) return byName;
  const asStored = path.isAbsolute(stored) ? stored : path.join(RESULTS_DIR, stored);
  return existsSync(asStored) ? asStored : null;
}

/**
 * True when the module whose `import.meta.url` is passed is the script node was
 * started with. Both sides are resolved through realpath and compared as file
 * URLs, so a path that needs URL-encoding (spaces, non-ASCII) or that goes
 * through a symlink still matches.
 */
export function isMainModule(metaUrl) {
  try {
    return pathToFileURL(realpathSync(process.argv[1])).href === pathToFileURL(realpathSync(fileURLToPath(metaUrl))).href;
  } catch {
    return false;
  }
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const hostNow = () => performance.timeOrigin + performance.now();
export const isoOf = (t) => new Date(t).toISOString();
export const sha256 = (text) => createHash("sha256").update(text).digest("hex");
export const normalizeWs = (text) => String(text).replace(/\s+/g, " ").trim();

export function gitCommit() {
  try {
    return execFileSync("git", ["-C", REPO, "rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "unknown";
  }
}

export const errLine = (e) =>
  e instanceof Error ? e.message.split("\n")[0] : String(e);
