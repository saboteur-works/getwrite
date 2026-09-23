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

// `src/lib/auth/auth-client.ts` calls `createAuthClient()` from
// `better-auth/react` at module import time. That client's `useSession()` is
// a nanostores atom hook: nanostores defers store cleanup via `setTimeout`
// (`nanostores/lifecycle/index.js`), rather than running it synchronously on
// React unmount. In CI (~185s per job vs. ~22s locally), that deferred
// timeout has far more chance to fire *after* Vitest has already torn down
// jsdom for a given test file. When it does, better-auth's own cleanup path
// (`better-auth/dist/client/broadcast-channel.mjs`'s
// `cleanupBroadcastSetup`, called from `session-refresh.mjs`'s `cleanup`)
// reaches for `window`, which no longer exists, and throws
// `ReferenceError: window is not defined` as an *unhandled* error outside
// any test's own execution — Vitest then attributes it to whichever file
// happens to be running when the timer elapses, which is why the attributed
// file differs between CI runs (observed: `tests/component/TrashView.test.tsx`
// + `tests/reorder-persistence.test.tsx` in one run, only
// `tests/reorder-persistence.test.tsx` in another) even though every test
// passes. Unmounting the subscription earlier would not help — unmount
// already happens; the problem is the deferred cleanup outliving the test
// environment.
//
// No test in this suite depends on the real better-auth client:
// `auth-screen.test.tsx` and `shellSettingsMenuLogout.test.tsx` inject the
// relevant behaviour as props (`signInEmail`/`signUpEmail`,
// `isAuthenticated`), `reset-password-form.test.tsx` mocks nothing from the
// client, and no test file mocks or asserts on `auth-client`/`useSession`
// today. So mocking `better-auth/react`'s `createAuthClient` here removes a
// real flake without weakening any coverage. Mocking the library entry point
// (rather than our own `auth-client` module) keeps `auth-client.ts`'s own
// code — its named exports, its wiring of `authClient.signIn` etc. — real;
// only the library's lifecycle machinery is replaced. The stub mirrors the
// real client's action surface (`signIn`, `signUp`, `signOut`,
// `revokeSessions`, `requestPasswordReset`, `resetPassword`, each read as a
// nested-method object off the client, e.g. `signIn.email(...)`) plus a
// `useSession()` returning a stable, always-settled, unauthenticated session
// shape matching better-auth's real one (`{ data, isPending, isRefetching,
// error, refetch }`, per `auth-client.ts`'s own doc comment). Removing this
// mock would reintroduce the flake and misattribute it to whatever test
// happens to be running when the timer fires.
vi.mock("better-auth/react", () => {
  // A callable stub that also exposes nested methods (e.g. `signIn.email`),
  // since `auth-client.ts` calls some actions directly (`signOut()`,
  // `revokeSessions()`) and others as a nested method
  // (`signIn.email(...)`, `signUp.email(...)`). Deliberately not a Proxy:
  // an unbounded `get` trap would answer a `"then"` property lookup with
  // another function, making the stub look thenable to anything that
  // probes for one (e.g. `await`), which is not a risk worth taking here.
  // Each call builds its OWN function, so the six actions below are distinct
  // references. Hoisting `callable` out of this factory would make
  // `Object.assign` return one shared function for all of them, and a future
  // test asserting on `signIn.email` would silently also count calls made
  // through `signUp` — a misattribution in the very fixture added to stop one.
  const actionStub = () => {
    const callable = () => Promise.resolve({ data: null, error: null });
    return Object.assign(callable, { email: callable });
  };

  return {
    createAuthClient: () => ({
      useSession: () => ({
        data: null,
        isPending: false,
        isRefetching: false,
        error: null,
        refetch: () => {},
      }),
      signIn: actionStub(),
      signUp: actionStub(),
      signOut: actionStub(),
      revokeSessions: actionStub(),
      requestPasswordReset: actionStub(),
      resetPassword: actionStub(),
    }),
  };
});
