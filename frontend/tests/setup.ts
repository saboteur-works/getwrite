import "@testing-library/jest-dom";

// Global test setup for Vitest + Testing Library
// Extend this file with any global mocks or helpers needed across tests.

// JSDOM does not implement ResizeObserver; mock it so libraries like
// @floating-ui (used by react-tooltip) don't throw during tests.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// JSDOM does not implement Document.elementFromPoint. TipTap 3.26's Placeholder
// viewport tracking calls ProseMirror's posAtCoords on editor mount, which
// relies on it; without a stub the editor throws during tests (real browsers
// implement it). Returning null is handled gracefully by posAtCoords.
if (
  typeof document !== "undefined" &&
  typeof document.elementFromPoint !== "function"
) {
  document.elementFromPoint = () => null;
}
