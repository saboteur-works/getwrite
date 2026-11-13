/**
 * @module settings-rail-preference
 *
 * Whether the Project Settings section rail is hidden at phone width. Stored
 * in `localStorage` for this origin only (one value per device, every
 * project), never in `project.json`. Absent or unreadable means shown. A
 * failed write keeps the choice for this page only; it is a layout
 * convenience, so no toast.
 */

/** Local storage key holding "true" when the rail is hidden. */
export const SETTINGS_RAIL_HIDDEN_STORAGE_KEY = "getwrite-settings-rail-hidden";

/**
 * Reads the stored choice. Never writes.
 *
 * @returns `true` only when the writer hid the rail on this device.
 */
export function readSettingsRailHidden(): boolean {
  try {
    return (
      window.localStorage.getItem(SETTINGS_RAIL_HIDDEN_STORAGE_KEY) === "true"
    );
  } catch {
    return false;
  }
}

/**
 * Stores the choice. A rejected write is ignored; the caller's state still
 * applies until the page closes.
 *
 * @param isHidden - `true` to remember the rail as hidden.
 */
export function writeSettingsRailHidden(isHidden: boolean): void {
  try {
    if (isHidden) {
      window.localStorage.setItem(SETTINGS_RAIL_HIDDEN_STORAGE_KEY, "true");
    } else {
      window.localStorage.removeItem(SETTINGS_RAIL_HIDDEN_STORAGE_KEY);
    }
  } catch {
    // Storage unavailable (private mode, blocked site data): keep in memory.
  }
}
