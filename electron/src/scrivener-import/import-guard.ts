// Last Updated: 2026-09-12

/**
 * Tracks whether a main-process-initiated Scrivener import has reached a
 * terminal outcome yet, independent of whatever the renderer believes.
 *
 * This is the main-process half of a start/finish guard preventing a second
 * import from starting while one is in flight. A renderer-side guard is a
 * separate concern and is not addressed here.
 */

/** A start/finish guard for a single in-flight import. */
export interface ImportGuard {
  /**
   * Attempts to claim the guard for a new import.
   *
   * @returns `true` if no import was already in flight and this call claimed
   *   it; `false` if an import was already in flight.
   */
  tryStart(): boolean;
  /**
   * Marks the in-flight import as having reached a terminal outcome, freeing
   * the guard for a subsequent `tryStart()`.
   */
  finish(): void;
}

/**
 * Creates a fresh, not-in-flight import guard.
 *
 * @returns A new {@link ImportGuard} instance.
 */
export function createImportGuard(): ImportGuard {
  let inFlight = false;

  return {
    tryStart(): boolean {
      if (inFlight) {
        return false;
      }
      inFlight = true;
      return true;
    },
    finish(): void {
      inFlight = false;
    },
  };
}
