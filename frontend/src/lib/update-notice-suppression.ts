/**
 * @module update-notice-suppression
 *
 * Client-side persistence for the update notice's "Dismiss" and "Skip this
 * version" actions. Both store the same value — the highest version the user has
 * chosen not to be reminded about — so the banner reappears only once a version
 * newer than the stored one ships (FR7). State lives in `localStorage`, scoped
 * to the desktop install. All accessors are SSR-safe and never throw.
 */
import { isNewer } from "./models/semver-compare";

const STORAGE_KEY = "getwrite.updateNotice.suppressedVersion";

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return null;
    }
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Returns the highest dismissed/skipped version, or `null` if none. */
export function getSuppressedVersion(): string | null {
  return safeStorage()?.getItem(STORAGE_KEY) ?? null;
}

/** Records `version` as suppressed (used by both Dismiss and Skip). */
export function setSuppressedVersion(version: string): void {
  try {
    safeStorage()?.setItem(STORAGE_KEY, version);
  } catch {
    // Best-effort: a storage failure simply means the notice may reappear.
  }
}

/** Removes any stored suppression. */
export function clearSuppressedVersion(): void {
  try {
    safeStorage()?.removeItem(STORAGE_KEY);
  } catch {
    // Best-effort.
  }
}

/**
 * Reports whether the notice for `latestVersion` should be suppressed — true
 * when a stored version exists and `latestVersion` is not newer than it.
 */
export function isSuppressed(latestVersion: string): boolean {
  const stored = getSuppressedVersion();
  if (!stored) {
    return false;
  }
  return !isNewer(latestVersion, stored);
}
