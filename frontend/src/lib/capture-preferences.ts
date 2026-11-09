/**
 * @module capture-preferences
 *
 * Two per-origin `localStorage` ids behind the Capture box's project choice
 * (Feature 106, FR-12): the project last captured into, and the project most
 * recently opened. Never stored in `project.json`. A read never writes; a
 * stored id that is malformed reads as absent; a storage failure on read or
 * write never throws, so capture is never blocked by it. Whether an id still
 * names a listed project is decided by {@link chooseDefaultProjectId}.
 */

/** Local storage key holding the id of the project last captured into. */
export const LAST_CAPTURED_PROJECT_STORAGE_KEY =
  "getwrite-capture-last-project";

/** Local storage key holding the id of the most recently opened project. */
export const LAST_OPENED_PROJECT_STORAGE_KEY = "getwrite-last-opened-project";

const PROJECT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * @param value - Any value read from storage or a list.
 * @returns `true` when it is a plausible project directory id (letters,
 *   digits, `-`, `_`; at most 128 characters).
 */
export function isWellFormedProjectId(value: unknown): value is string {
  return typeof value === "string" && PROJECT_ID_PATTERN.test(value);
}

function readId(key: string): string | null {
  try {
    const stored = window.localStorage.getItem(key);
    return isWellFormedProjectId(stored) ? stored : null;
  } catch {
    return null;
  }
}

function writeId(key: string, projectId: string): boolean {
  if (!isWellFormedProjectId(projectId)) return false;
  try {
    window.localStorage.setItem(key, projectId);
    return true;
  } catch {
    return false;
  }
}

/** @returns The last-captured project id, or `null` if absent, malformed or unreadable. */
export function readLastCapturedProjectId(): string | null {
  return readId(LAST_CAPTURED_PROJECT_STORAGE_KEY);
}

/** @returns `true` if stored; `false` if the id is malformed or storage rejected it. */
export function writeLastCapturedProjectId(projectId: string): boolean {
  return writeId(LAST_CAPTURED_PROJECT_STORAGE_KEY, projectId);
}

/** @returns The most recently opened project id, or `null` if absent, malformed or unreadable. */
export function readLastOpenedProjectId(): string | null {
  return readId(LAST_OPENED_PROJECT_STORAGE_KEY);
}

/** @returns `true` if stored; `false` if the id is malformed or storage rejected it. */
export function writeLastOpenedProjectId(projectId: string): boolean {
  return writeId(LAST_OPENED_PROJECT_STORAGE_KEY, projectId);
}

/**
 * Picks the default project: last-captured, else most recently opened, else
 * the first listed. A remembered id not in `listedIds` is treated as gone.
 *
 * @param listedIds - Ids of the projects offered, in display order.
 * @param lastCaptured - The remembered last-captured id, or `null`.
 * @param lastOpened - The remembered most-recently-opened id, or `null`.
 * @returns The default id, or `null` when nothing is offered.
 */
export function chooseDefaultProjectId(
  listedIds: readonly string[],
  lastCaptured: string | null,
  lastOpened: string | null,
): string | null {
  if (lastCaptured !== null && listedIds.includes(lastCaptured)) {
    return lastCaptured;
  }
  if (lastOpened !== null && listedIds.includes(lastOpened)) {
    return lastOpened;
  }
  return listedIds[0] ?? null;
}
