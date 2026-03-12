/**
 * @module UserPreferences
 *
 * Helpers for reading and writing user preferences embedded in
 * project metadata.
 */

import type { MetadataValue } from "./models/types";

/**
 * Supported UI color mode preference values.
 */
export type ColorMode = "light" | "dark";

/** Local storage key used for global fallback user preferences. */
export const GLOBAL_COLOR_MODE_STORAGE_KEY = "getwrite-color-mode";

/** Metadata key containing user preference values on `project.metadata`. */
export const PROJECT_USER_PREFERENCES_KEY = "userPreferences";

/**
 * Supported user preference payload persisted in project metadata.
 */
export interface ProjectUserPreferences {
    /** Preferred color mode for the project UI. */
    colorMode?: ColorMode;
}

/**
 * Extracts user preferences from project metadata.
 *
 * @param metadata - Optional project metadata object.
 * @returns Parsed user preferences object.
 */
export function getUserPreferencesFromProjectMetadata(
    metadata?: Record<string, MetadataValue>,
): ProjectUserPreferences {
    if (!metadata) {
        return {};
    }

    const raw = metadata[PROJECT_USER_PREFERENCES_KEY];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return {};
    }

    const rawRecord = raw as Record<string, MetadataValue>;
    const colorMode = rawRecord.colorMode;

    return {
        colorMode:
            colorMode === "light" || colorMode === "dark"
                ? colorMode
                : undefined,
    };
}

/**
 * Resolves preferred color mode from project metadata first, then system preference.
 *
 * @param metadata - Optional project metadata object.
 * @returns Preferred color mode.
 */
export function resolvePreferredColorMode(
    metadata?: Record<string, MetadataValue>,
): ColorMode {
    const preferences = getUserPreferencesFromProjectMetadata(metadata);

    if (preferences.colorMode) {
        return preferences.colorMode;
    }

    const globalMode = getStoredGlobalColorMode();
    if (globalMode) {
        return globalMode;
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
 * Creates a metadata object with merged user preference values.
 *
 * @param currentMetadata - Existing project metadata map.
 * @param updates - Preference updates to merge.
 * @returns Updated metadata map.
 */
export function mergeUserPreferencesIntoProjectMetadata(
    currentMetadata: Record<string, MetadataValue> | undefined,
    updates: Partial<ProjectUserPreferences>,
): Record<string, MetadataValue> {
    const existingPreferences =
        getUserPreferencesFromProjectMetadata(currentMetadata);

    const mergedPreferences: Record<string, MetadataValue> = {
        ...existingPreferences,
        ...updates,
    };

    return {
        ...(currentMetadata ?? {}),
        [PROJECT_USER_PREFERENCES_KEY]: mergedPreferences,
    };
}

/**
 * Reads globally persisted color mode preference from local storage.
 *
 * @returns Stored color mode value, or `null` when none exists.
 */
export function getStoredGlobalColorMode(): ColorMode | null {
    try {
        const stored = window.localStorage.getItem(
            GLOBAL_COLOR_MODE_STORAGE_KEY,
        );
        if (stored === "light" || stored === "dark") {
            return stored;
        }
    } catch {
        return null;
    }

    return null;
}

/**
 * Persists global fallback color mode in local storage.
 *
 * @param mode - Color mode to persist.
 */
export function saveGlobalColorMode(mode: ColorMode): void {
    try {
        window.localStorage.setItem(GLOBAL_COLOR_MODE_STORAGE_KEY, mode);
    } catch {
        // Ignore persistence failures in constrained environments.
    }
}
