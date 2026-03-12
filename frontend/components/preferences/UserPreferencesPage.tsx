"use client";

/**
 * @module UserPreferencesPage
 *
 * UI for editing persisted user preferences.
 */

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
    type ColorMode,
    resolvePreferredColorMode,
    saveColorMode,
} from "../../src/lib/user-preferences";

/**
 * User preferences page UI.
 *
 * @returns Preferences page element.
 */
export default function UserPreferencesPage(): JSX.Element {
    const router = useRouter();
    const [colorMode, setColorMode] = useState<ColorMode>("light");

    useEffect(() => {
        setColorMode(resolvePreferredColorMode());
    }, []);

    /**
     * Persists and updates color mode preference.
     *
     * @param nextMode - Selected color mode.
     */
    const handleColorModeChange = (nextMode: ColorMode): void => {
        setColorMode(nextMode);
        saveColorMode(nextMode);
    };

    /**
     * Closes preferences and returns to previous page when possible.
     */
    const handleClose = (): void => {
        if (window.history.length > 1) {
            router.back();
            return;
        }

        router.push("/");
    };

    return (
        <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8 lg:px-10">
            <header className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold text-slate-900">
                        User Preferences
                    </h1>
                    <p className="text-sm text-slate-600">
                        Personal settings stored on this device.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={handleClose}
                    className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                    Close
                </button>
            </header>

            <section className="rounded-lg border border-slate-200 bg-white p-5">
                <h2 className="text-sm font-semibold text-slate-900">Theme</h2>
                <p className="mt-1 text-sm text-slate-600">
                    Choose the default UI theme.
                </p>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <button
                        type="button"
                        onClick={() => handleColorModeChange("light")}
                        className={`rounded-md border px-3 py-2 text-sm font-medium ${
                            colorMode === "light"
                                ? "border-slate-700 bg-slate-100 text-slate-900"
                                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                        }`}
                        aria-pressed={colorMode === "light"}
                    >
                        Light
                    </button>
                    <button
                        type="button"
                        onClick={() => handleColorModeChange("dark")}
                        className={`rounded-md border px-3 py-2 text-sm font-medium ${
                            colorMode === "dark"
                                ? "border-slate-700 bg-slate-100 text-slate-900"
                                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                        }`}
                        aria-pressed={colorMode === "dark"}
                    >
                        Dark
                    </button>
                </div>
            </section>
        </main>
    );
}
