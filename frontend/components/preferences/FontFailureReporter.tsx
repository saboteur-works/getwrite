"use client";

/**
 * Feature 91, Task 10 (FR-18): mounts once under the root layout and reports a
 * bundled face that fails to load via `console.error`. Renders nothing; needs
 * no context, so no Storybook decorator.
 */
import { useEffect } from "react";
import { watchFontFailures } from "../../src/lib/fonts/report-font-failures";

export default function FontFailureReporter(): null {
  useEffect(
    () =>
      watchFontFailures(
        typeof document === "undefined" ? undefined : document.fonts,
      ),
    [],
  );
  return null;
}
