/**
 * @module update-check-transport-service
 *
 * HTTP transport for the update notice. Calls `GET /api/version-check` and
 * returns the typed result. Any network or parse failure resolves to
 * `{ updateAvailable: false }` so the caller never has to guard against errors
 * (the notice simply does not appear).
 */
import type { UpdateCheckResult } from "../lib/models/update-check";

const NO_UPDATE: UpdateCheckResult = { updateAvailable: false };

/** Fetches the current update-check result. Never throws. */
export async function fetchUpdateCheck(): Promise<UpdateCheckResult> {
  try {
    const response = await fetch("/api/version-check");
    if (!response.ok) {
      return NO_UPDATE;
    }
    return (await response.json()) as UpdateCheckResult;
  } catch {
    return NO_UPDATE;
  }
}
