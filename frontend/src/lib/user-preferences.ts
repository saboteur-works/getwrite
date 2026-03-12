/**
 * @module UserPreferences
 *
 * Lightweight local preference persistence helpers for UI settings.
 */

/**
 * Supported UI color mode preference values.
 */
export type ColorMode = "light" | "dark";

/**
 * Storage key used for persisted color mode preference.
 */
export const COLOR_MODE_STORAGE_KEY = "getwrite-color-mode";

/**
 * Reads the persisted color mode from local storage.
 *
 * @returns Stored color mode value, or `null` when none exists.
 */
export function getStoredColorMode(): ColorMode | null {
    try {
        const stored = window.localStorage.getItem(COLOR_MODE_STORAGE_KEY);
        if (stored === "light" || stored === "dark") {
            return stored;
        }
    } catch {
        return null;
    }

    return null;
}

/**
 * Resolves preferred color mode from storage first, then system preference.
 *
 * @returns Preferred color mode.
 */
export function resolvePreferredColorMode(): ColorMode {
    const stored = getStoredColorMode();
    if (stored) {
        return stored;
    }

    try {
        const prefersDark = window.matchMedia(
            "(prefers-color-scheme: dark)",
        ).matches;
        return prefersDark ? "dark" : "light";
    } catch {
        return "light";
    }
}

/**
 * Persists color mode preference in local storage.
 *
 * @param mode - Color mode to persist.
 */
export function saveColorMode(mode: ColorMode): void {
    try {
        window.localStorage.setItem(COLOR_MODE_STORAGE_KEY, mode);
    } catch {
        // Ignore persistence failures in constrained environments.
    }
}
