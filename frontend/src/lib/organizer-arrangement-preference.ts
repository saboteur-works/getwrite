/**
 * @module organizer-arrangement-preference
 *
 * Per-device, per-origin `localStorage` record of the last-used Organizer
 * arrangement for one project (Feature 109, FR-16). The key is
 * `getwrite-organizer-arrangement:<projectDirId>` and the value is the
 * arrangement id; an absent value means the default arrangement. Never stored
 * in `project.json`. A read never writes; a malformed value reads as absent;
 * a storage failure on read or write never throws, so the Organizer is never
 * blocked by it. Whether an id still names a usable arrangement is decided by
 * the caller, not here.
 */

import { isWellFormedProjectId } from "./capture-preferences";

const KEY_PREFIX = "getwrite-organizer-arrangement:";

/**
 * @param projectDirId - The project directory id.
 * @returns The local storage key holding that project's last-used arrangement id.
 */
export function organizerArrangementStorageKey(projectDirId: string): string {
  return `${KEY_PREFIX}${projectDirId}`;
}

/**
 * Reads the remembered arrangement id. Never writes.
 *
 * @returns The id, or `null` when nothing is stored, the stored value or the
 *   project id is malformed, or storage is unreadable (all read as the
 *   default arrangement).
 */
export function readLastOrganizerArrangementId(
  projectDirId: string,
): string | null {
  if (!isWellFormedProjectId(projectDirId)) return null;
  try {
    const stored = window.localStorage.getItem(
      organizerArrangementStorageKey(projectDirId),
    );
    return isWellFormedProjectId(stored) ? stored : null;
  } catch {
    return null;
  }
}

/**
 * Remembers the arrangement id for the project.
 *
 * @returns `true` if stored; `false` if either id is malformed or storage
 *   rejected the write.
 */
export function writeLastOrganizerArrangementId(
  projectDirId: string,
  arrangementId: string,
): boolean {
  if (
    !isWellFormedProjectId(projectDirId) ||
    !isWellFormedProjectId(arrangementId)
  ) {
    return false;
  }
  try {
    window.localStorage.setItem(
      organizerArrangementStorageKey(projectDirId),
      arrangementId,
    );
    return true;
  } catch {
    return false;
  }
}
