/**
 * @module UserPreferences
 *
 * Helpers for reading and writing user preferences embedded in
 * project metadata and app-wide appearance preferences.
 */

import type { MetadataValue } from "./models/types";

/**
 * Supported UI color mode preference values.
 */
export type ColorMode = "light" | "dark";

/**
 * User-selected color mode preference including system mode.
 */
export type ColorModePreference = ColorMode | "system";

/**
 * Supported UI density settings.
 */
export type UiDensity = "comfortable" | "compact";

/**
 * App-wide appearance preference payload.
 */
export interface AppearancePreferences {
    /** Selected color mode preference. */
    colorModePreference: ColorModePreference;
    /** Selected visual density level. */
    density: UiDensity;
    /** Whether reduced-motion mode is enabled. */
    reducedMotion: boolean;
}

/** Local storage key used for global fallback user preferences. */
export const GLOBAL_COLOR_MODE_STORAGE_KEY = "getwrite-color-mode";

/** Local storage key used for app-wide appearance preference payload. */
export const GLOBAL_APPEARANCE_STORAGE_KEY = "getwrite-appearance-preferences";

/** Browser event emitted when app-wide appearance changes. */
export const APPEARANCE_CHANGED_EVENT = "getwrite:appearance-changed";

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
 * Default app-wide appearance preferences.
 */
export const DEFAULT_APPEARANCE_PREFERENCES: AppearancePreferences = {
    colorModePreference: "system",
    density: "comfortable",
    reducedMotion: false,
};

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

    const appearance = getStoredGlobalAppearancePreferences();
    if (appearance.colorModePreference !== "system") {
        return appearance.colorModePreference;
    }

    if (!hasStoredGlobalAppearancePreferences()) {
        const globalMode = getStoredGlobalColorMode();
        if (globalMode) {
            return globalMode;
        }
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
        emitAppearanceChangedEvent();
    } catch {
        // Ignore persistence failures in constrained environments.
    }
}

/**
 * Reads app-wide appearance preferences from local storage.
 *
 * @returns Validated appearance preferences with defaults applied.
 */
export function getStoredGlobalAppearancePreferences(): AppearancePreferences {
    try {
        const raw = window.localStorage.getItem(GLOBAL_APPEARANCE_STORAGE_KEY);
        if (!raw) {
            return DEFAULT_APPEARANCE_PREFERENCES;
        }

        const parsed = JSON.parse(raw) as Partial<AppearancePreferences>;
        const colorModePreference =
            parsed.colorModePreference === "light" ||
            parsed.colorModePreference === "dark" ||
            parsed.colorModePreference === "system"
                ? parsed.colorModePreference
                : DEFAULT_APPEARANCE_PREFERENCES.colorModePreference;

        const density =
            parsed.density === "compact" || parsed.density === "comfortable"
                ? parsed.density
                : DEFAULT_APPEARANCE_PREFERENCES.density;

        const reducedMotion =
            typeof parsed.reducedMotion === "boolean"
                ? parsed.reducedMotion
                : DEFAULT_APPEARANCE_PREFERENCES.reducedMotion;

        return {
            colorModePreference,
            density,
            reducedMotion,
        };
    } catch {
        return DEFAULT_APPEARANCE_PREFERENCES;
    }
}

/**
 * Persists app-wide appearance preferences to local storage.
 *
 * @param preferences - Appearance preferences to persist.
 */
export function saveGlobalAppearancePreferences(
    preferences: AppearancePreferences,
): void {
    try {
        window.localStorage.setItem(
            GLOBAL_APPEARANCE_STORAGE_KEY,
            JSON.stringify(preferences),
        );

        if (preferences.colorModePreference === "system") {
            window.localStorage.removeItem(GLOBAL_COLOR_MODE_STORAGE_KEY);
        }

        emitAppearanceChangedEvent();
    } catch {
        // Ignore persistence failures in constrained environments.
    }
}

/**
 * Resolves the effective color mode from app-wide appearance preferences.
 *
 * @param preferences - Appearance preferences to resolve.
 * @returns Effective color mode.
 */
export function resolveColorModeFromAppearance(
    preferences: AppearancePreferences,
): ColorMode {
    if (preferences.colorModePreference === "light") {
        return "light";
    }

    if (preferences.colorModePreference === "dark") {
        return "dark";
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
 * Dispatches an in-window event notifying listeners of appearance updates.
 */
function emitAppearanceChangedEvent(): void {
    try {
        window.dispatchEvent(new Event(APPEARANCE_CHANGED_EVENT));
    } catch {
        // Ignore event dispatch failures.
    }
}

/**
 * Checks whether explicit global appearance preferences have been saved.
 *
 * @returns `true` when appearance preferences exist in local storage.
 */
function hasStoredGlobalAppearancePreferences(): boolean {
    try {
        return (
            window.localStorage.getItem(GLOBAL_APPEARANCE_STORAGE_KEY) !== null
        );
    } catch {
        return false;
    }
}
