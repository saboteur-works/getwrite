/**
 * @module Toaster
 *
 * Main toast notification provider for the application.
 *
 * Configured with:
 * - bottom-right stack positioning (~3s auto-dismiss)
 * - Semantic success/error/loading styling
 * - Theme-aware colors with proper contrast
 * - Gutter spacing between toasts
 *
 * @example
 * ```tsx
 * // In layout.tsx or root component
 * <AppToaster />
 * ```
 */

"use client";

import React from "react";
import { Toaster } from "react-hot-toast";

export default function AppToaster(): JSX.Element {
    return (
        <Toaster
            position="bottom-right"
            reverseOrder={false}
            gutter={16}
            toastOptions={{
                // Default options
                duration: 3000,
                style: {
                    background: "#1f2937",
                    color: "#f3f4f6",
                    borderRadius: "0.5rem",
                    padding: "1rem 1.25rem",
                    boxShadow:
                        "0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)",
                    fontSize: "0.875rem",
                    lineHeight: "1.25rem",
                    fontFamily: "system-ui, -apple-system, sans-serif",
                },
                // Success styling
                success: {
                    duration: 3000,
                    style: {
                        background: "#065f46",
                        color: "#d1fae5",
                        borderLeft: "4px solid #10b981",
                    },
                    iconTheme: {
                        primary: "#10b981",
                        secondary: "#065f46",
                    },
                },
                // Error styling
                error: {
                    duration: 4000,
                    style: {
                        background: "#7f1d1d",
                        color: "#fee2e2",
                        borderLeft: "4px solid #ef4444",
                    },
                    iconTheme: {
                        primary: "#ef4444",
                        secondary: "#7f1d1d",
                    },
                },
                // Loading styling (custom type)
                loading: {
                    style: {
                        background: "#1e3a8a",
                        color: "#dbeafe",
                        borderLeft: "4px solid #3b82f6",
                    },
                },
            }}
        />
    );
}
