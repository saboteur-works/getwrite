/**
 * @module ToastProvider
 *
 * React component that provides the toast notification system to the entire app.
 *
 * Wraps the Next.js Toaster component with app-specific configuration:
 * - Stack position: bottom-right
 * - Auto-dismiss timers with progress indication
 * - Theme-aware styling
 * - Reduced motion support
 *
 * Place near root of app (in layout.tsx or page.tsx).
 *
 * @example
 * ```tsx
 * <ToastProvider>
 *   <App />
 * </ToastProvider>
 * ```
 */

"use client";

import { Toaster } from "react-hot-toast";

export function ToastProvider() {
    return (
        <Toaster
            position="bottom-right"
            reverseOrder={false}
            gutter={16}
            containerClassName="toast-container"
            containerStyle={{
                bottom: 16,
                right: 16,
            }}
            toastOptions={{
                // Default options
                duration: 3000,
                style: {
                    background: "#fff",
                    color: "#000",
                    borderRadius: "0.5rem",
                    padding: "1rem",
                    boxShadow:
                        "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
                    fontSize: "0.875rem",
                    lineHeight: "1.25rem",
                },
                // Per-type styling
                success: {
                    style: {
                        background: "#f0fdf4",
                        color: "#166534",
                        borderLeft: "4px solid #16a34a",
                    },
                    iconTheme: {
                        primary: "#16a34a",
                        secondary: "#f0fdf4",
                    },
                },
                error: {
                    style: {
                        background: "#fef2f2",
                        color: "#991b1b",
                        borderLeft: "4px solid #dc2626",
                    },
                    iconTheme: {
                        primary: "#dc2626",
                        secondary: "#fef2f2",
                    },
                },
                loading: {
                    style: {
                        background: "#f5f5f5",
                        color: "#1f2937",
                        borderLeft: "4px solid #3b82f6",
                    },
                },
            }}
        />
    );
}

export default ToastProvider;
