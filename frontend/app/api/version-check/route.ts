import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import {
  checkForUpdate,
  type UpdateCheckResult,
} from "../../../src/lib/models/update-check";

/**
 * GET /api/version-check
 *
 * Returns whether a newer GetWrite release exists. The check runs only for the
 * Electron desktop build (gated by `GETWRITE_DESKTOP`, injected by the desktop
 * shell); every other caller, and every failure, receives
 * `{ updateAvailable: false }`. The result is cached per running version for 24h
 * so the GitHub Releases API is hit at most once per day per server process.
 */

const NO_UPDATE: UpdateCheckResult = { updateAvailable: false };
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_REPO = "saboteur-works/getwrite";

let cache: { version: string; at: number; result: UpdateCheckResult } | null =
  null;

/** Resolves the running app version from the injected env, falling back to package.json. */
function resolveCurrentVersion(): string | null {
  if (process.env.GETWRITE_APP_VERSION) {
    return process.env.GETWRITE_APP_VERSION;
  }
  try {
    const pkgPath = path.join(process.cwd(), "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
      version?: unknown;
    };
    return typeof pkg.version === "string" ? pkg.version : null;
  } catch {
    return null;
  }
}

export async function GET(): Promise<NextResponse> {
  if (process.env.GETWRITE_DESKTOP !== "1") {
    return NextResponse.json(NO_UPDATE);
  }

  const version = resolveCurrentVersion();
  if (!version) {
    return NextResponse.json(NO_UPDATE);
  }

  const now = Date.now();
  if (cache && cache.version === version && now - cache.at < CACHE_TTL_MS) {
    return NextResponse.json(cache.result);
  }

  const repo = process.env.GETWRITE_REPO ?? DEFAULT_REPO;
  const result = await checkForUpdate({
    currentVersion: version,
    repo,
    platform: process.platform,
  });

  cache = { version, at: now, result };
  return NextResponse.json(result);
}
