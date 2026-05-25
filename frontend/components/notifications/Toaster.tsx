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
        duration: 3000,
        style: {
          background: "var(--color-gw-toast-bg)",
          color: "var(--color-gw-toast-fg)",
          borderRadius: "0.5rem",
          padding: "1rem 1.25rem",
          boxShadow:
            "0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)",
          fontSize: "0.875rem",
          lineHeight: "1.25rem",
          fontFamily: "system-ui, -apple-system, sans-serif",
        },
        success: {
          duration: 3000,
          style: {
            background: "var(--color-gw-toast-success-bg)",
            color: "var(--color-gw-toast-success-fg)",
            borderLeft: "4px solid var(--color-gw-saved)",
          },
          iconTheme: {
            primary: "var(--color-gw-saved)",
            secondary: "var(--color-gw-toast-success-bg)",
          },
        },
        error: {
          duration: 4000,
          style: {
            background: "var(--color-gw-toast-error-bg)",
            color: "var(--color-gw-toast-error-fg)",
            borderLeft: "4px solid var(--color-gw-saving)",
          },
          iconTheme: {
            primary: "var(--color-gw-saving)",
            secondary: "var(--color-gw-toast-error-bg)",
          },
        },
        loading: {
          style: {
            background: "var(--color-gw-toast-bg)",
            color: "var(--color-gw-toast-fg)",
            borderLeft: "4px solid var(--color-gw-saving)",
          },
        },
      }}
    />
  );
}
