import { vi } from "vitest";
import "@testing-library/jest-dom";

// Global test setup for Vitest + Testing Library
// Extend this file with any global mocks or helpers needed across tests.

// `server-only` is a Next.js-bundler-specific guard package: it is only
// inert under Next's webpack "react-server" resolve condition, and throws
// unconditionally under plain Node/Vitest. As of Slice 6 Task 3
// (`app/api/_tenant/identity-source.ts`), `getIdentitySource()` — a
// function on the hot path of every tenant-resolving route, exercised by
// dozens of otherwise-unrelated route/model tests — unconditionally calls
// `isHostedAuthActive()` (`src/lib/auth/auth-config.ts`) on every
// invocation to implement FR7's precedence rule, so `identity-source.ts`
// now transitively imports `auth-config.ts`/`auth-server.ts`, both of which
// `import "server-only"` as required by FR5. Mocking `server-only` globally
// here — rather than per-file, as the handful of auth-module tests that
// pre-date this change already do redundantly and harmlessly — is what
// keeps that FR5 guard real (still enforced by the source-text assertion in
// `tests/unit/auth-server-only-guard.test.ts`) without breaking every test
// that now transitively touches the identity seam.
vi.mock("server-only", () => ({}));

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
