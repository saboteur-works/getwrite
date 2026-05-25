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
