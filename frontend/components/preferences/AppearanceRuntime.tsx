"use client";

/**
 * @module AppearanceRuntime
 *
 * Applies app-wide appearance preferences to the document root at runtime.
 */

import React, { useEffect } from "react";
import {
    APPEARANCE_CHANGED_EVENT,
    getStoredGlobalAppearancePreferences,
    resolveColorModeFromAppearance,
} from "../../src/lib/user-preferences";

/**
 * Applies current appearance preferences to the HTML root classes/attributes.
 */
function applyAppearanceToDocument(): void {
    const root = document.documentElement;
    const appearance = getStoredGlobalAppearancePreferences();
    const effectiveMode = resolveColorModeFromAppearance(appearance);

    root.classList.toggle("gw-theme-dark", effectiveMode === "dark");
    root.classList.toggle("gw-theme-light", effectiveMode === "light");

    root.classList.toggle(
        "gw-density-compact",
        appearance.density === "compact",
    );
    root.classList.toggle(
        "gw-density-comfortable",
        appearance.density === "comfortable",
    );

    root.classList.toggle("gw-reduced-motion", appearance.reducedMotion);

    root.setAttribute("data-gw-density", appearance.density);
    root.setAttribute(
        "data-gw-motion",
        appearance.reducedMotion ? "reduced" : "full",
    );
}

/**
 * Runtime appearance controller component.
 *
 * @returns `null` because this component only applies side effects.
 */
export default function AppearanceRuntime(): JSX.Element | null {
    useEffect(() => {
        applyAppearanceToDocument();

        const onAppearanceChanged = () => {
            applyAppearanceToDocument();
        };

        window.addEventListener(APPEARANCE_CHANGED_EVENT, onAppearanceChanged);

        return () => {
            window.removeEventListener(
                APPEARANCE_CHANGED_EVENT,
                onAppearanceChanged,
            );
        };
    }, []);

    return null;
}
