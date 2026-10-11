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
import path from "node:path";
import { fileURLToPath } from "node:url";

export const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));
export const SCRIPTS_DIR = path.resolve(LIB_DIR, "..");
export const FEATURE_DIR = path.resolve(SCRIPTS_DIR, "..");
export const REPO = path.resolve(FEATURE_DIR, "../../..");
export const FRONTEND = path.join(REPO, "frontend");
export const RESULTS_DIR = path.join(FEATURE_DIR, "results");

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
