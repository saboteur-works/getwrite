/**
 * @module folklore-selection-preference
 *
 * Per-device, per-origin `localStorage` record of the picked narrative and the
 * chosen variants for one project (Feature 110, FR-14, FR-17). The key is
 * `getwrite-folklore-selection:<projectDirId>` and the value is JSON
 * `{ narrativeId, variantIds }`. Never stored in `project.json`; a device
 * preference is not a stored record. A read never writes, and only well-formed
 * ids are accepted. A storage failure never throws: a read reports it as
 * `unreadable`, distinct from `none` (nothing stored); write and clear return
 * `false`. Whether an id still names a variant is decided by
 * {@link resolveFolkloreSelection}, which the caller applies to what it read.
 * Writing only when the writer changes the selection is the caller's job.
 */

import { isWellFormedProjectId } from "./capture-preferences";
import type { FolkloreSelection } from "./models/folklore-types";

const KEY_PREFIX = "getwrite-folklore-selection:";

/** Result of reading the remembered selection. */
export type FolkloreSelectionRead =
  | { status: "stored"; selection: FolkloreSelection }
  | { status: "none" }
  | { status: "unreadable" };

/** A remembered selection checked against the narrative's current variants. */
export interface ResolvedFolkloreSelection {
  /** The selection with ids that no longer name a variant removed. */
  selection: FolkloreSelection;
  /** True when at least one remembered variant id was removed. */
  choiceLost: boolean;
  /** The removed ids, in remembered order. */
  lostVariantIds: string[];
}

/**
 * @param projectDirId - The project directory id.
 * @returns The local storage key holding that project's remembered selection.
 */
export function folkloreSelectionStorageKey(projectDirId: string): string {
  return `${KEY_PREFIX}${projectDirId}`;
}

function parseSelection(raw: string): FolkloreSelection | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const { narrativeId, variantIds } = value as Record<string, unknown>;
  if (narrativeId !== null && !isWellFormedProjectId(narrativeId)) return null;
  if (!Array.isArray(variantIds)) return null;
  const kept: string[] = [];
  for (const id of variantIds) {
    if (isWellFormedProjectId(id) && !kept.includes(id)) kept.push(id);
  }
  return { narrativeId, variantIds: kept };
}

/**
 * Reads the remembered selection. Never writes.
 *
 * @returns `stored` with the selection; `none` when nothing is stored or the
 *   stored value or project id is malformed; `unreadable` when storage threw.
 */
export function readFolkloreSelection(
  projectDirId: string,
): FolkloreSelectionRead {
  if (!isWellFormedProjectId(projectDirId)) return { status: "none" };
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(
      folkloreSelectionStorageKey(projectDirId),
    );
  } catch {
    return { status: "unreadable" };
  }
  if (raw === null) return { status: "none" };
  const selection = parseSelection(raw);
  return selection ? { status: "stored", selection } : { status: "none" };
}

/**
 * Remembers the selection for the project.
 *
 * @returns `true` if stored; `false` if an id is malformed or storage rejected
 *   the write.
 */
export function writeFolkloreSelection(
  projectDirId: string,
  selection: FolkloreSelection,
): boolean {
  const { narrativeId, variantIds } = selection;
  if (
    !isWellFormedProjectId(projectDirId) ||
    (narrativeId !== null && !isWellFormedProjectId(narrativeId)) ||
    !variantIds.every((id) => isWellFormedProjectId(id))
  ) {
    return false;
  }
  try {
    window.localStorage.setItem(
      folkloreSelectionStorageKey(projectDirId),
      JSON.stringify({ narrativeId, variantIds }),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Forgets the remembered selection for the project.
 *
 * @returns `true` if the key is gone (including when never set); `false` if
 *   the project id is malformed or storage rejected the removal.
 */
export function clearFolkloreSelection(projectDirId: string): boolean {
  if (!isWellFormedProjectId(projectDirId)) return false;
  try {
    window.localStorage.removeItem(folkloreSelectionStorageKey(projectDirId));
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks a remembered selection against the variants the picked narrative has
 * now. An id that no longer names one reads as absent and sets `choiceLost`,
 * which the tab shows in text. Pure; writes nothing.
 *
 * @param selection - What was read from storage.
 * @param currentVariantIds - Ids of the narrative's variants today.
 */
export function resolveFolkloreSelection(
  selection: FolkloreSelection,
  currentVariantIds: readonly string[],
): ResolvedFolkloreSelection {
  const current = new Set(currentVariantIds);
  const variantIds = selection.variantIds.filter((id) => current.has(id));
  const lostVariantIds = selection.variantIds.filter((id) => !current.has(id));
  return {
    selection: { narrativeId: selection.narrativeId, variantIds },
    choiceLost: lostVariantIds.length > 0,
    lostVariantIds,
  };
}
