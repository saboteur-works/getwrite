/**
 * @module spellcheck-preference
 *
 * App-wide spell-check switch (spec FR-33, FR-34). Stored in `localStorage`
 * for this origin only; never in `project.json`. Absent value means on, and a
 * read never writes (no migration). A change dispatches
 * `SPELLCHECK_CHANGED_EVENT` in this window; other tabs are told by the
 * browser's `storage` event, handled in `useSpellcheckEnabled`.
 */

import { toastService } from "./toast-service";

/** Local storage key holding the spell-check switch ("true" / "false"). */
export const SPELLCHECK_ENABLED_STORAGE_KEY = "getwrite-spellcheck-enabled";

/** Browser event emitted when the switch changes in this window. */
export const SPELLCHECK_CHANGED_EVENT = "getwrite:spellcheck-changed";

/** Fixed toast id so repeated failed saves collapse into one toast. */
const SPELLCHECK_NOT_SAVED_TOAST_ID = "spellcheck-not-saved";

/**
 * Value held for this session when storage rejected a write, so the toggle
 * still works until the page closes. Cleared when storage is next read
 * successfully with a stored value, or written successfully.
 */
let isSessionEnabled: boolean | null = null;

/** Clears the in-memory session value (tests, cross-tab updates). */
export function resetSpellcheckSessionValue(): void {
  isSessionEnabled = null;
}

/**
 * Reads the switch. Never writes.
 *
 * @returns `false` only when the user turned it off; `true` when nothing is
 *   stored, the stored value is unrecognised, or storage is unreadable.
 */
export function readSpellcheckEnabled(): boolean {
  if (isSessionEnabled !== null) return isSessionEnabled;
  try {
    return (
      window.localStorage.getItem(SPELLCHECK_ENABLED_STORAGE_KEY) !== "false"
    );
  } catch {
    return true;
  }
}

/**
 * Writes the switch and notifies this window. If storage rejects the write
 * the new value still applies for the session and a toast says it was not
 * saved.
 */
export function writeSpellcheckEnabled(shouldEnable: boolean): void {
  try {
    window.localStorage.setItem(
      SPELLCHECK_ENABLED_STORAGE_KEY,
      shouldEnable ? "true" : "false",
    );
    isSessionEnabled = null;
  } catch {
    isSessionEnabled = shouldEnable;
    toastService.error(
      "Spell-check setting not saved",
      "It applies until you close this page, then returns to its previous value.",
      { id: SPELLCHECK_NOT_SAVED_TOAST_ID },
    );
  }
  window.dispatchEvent(new Event(SPELLCHECK_CHANGED_EVENT));
}
