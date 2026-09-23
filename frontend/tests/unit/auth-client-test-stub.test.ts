import { describe, it, expect } from "vitest";
import {
  useSession,
  signIn,
  signUp,
  signOut,
  revokeSessions,
  requestPasswordReset,
  resetPassword,
} from "../../src/lib/auth/auth-client";

/**
 * Regression coverage for `tests/setup.ts`'s global `better-auth/react` mock
 * (see the comment there for the measured mechanism: nanostores defers
 * store cleanup via `setTimeout`, which can fire after Vitest has torn down
 * jsdom for whichever file happens to be running, throwing
 * `ReferenceError: window is not defined` from
 * `better-auth/dist/client/broadcast-channel.mjs` as an error unattributable
 * to any one test).
 *
 * This cannot prove the flake is gone — a passing run never proves an
 * intermittent absence — but it does assert the actual mechanism is
 * removed: `auth-client.ts`'s exported `useSession` is the synchronous stub
 * from the mock (a plain function returning a fixed object), not
 * better-auth's real nanostores-backed hook. If the global mock in
 * `tests/setup.ts` were removed or stopped applying, this test would fail
 * because the real `useSession` requires a React render context to invoke
 * (it reads a nanostores atom via `useStore`), whereas the stub can be
 * called directly like any plain function.
 */
describe("auth-client under test — better-auth/react mock", () => {
  it("useSession() is a stub callable outside a React render, returning the documented shape", () => {
    // The real better-auth `useSession` is a nanostores-backed React hook
    // and cannot be invoked outside a component render (it calls
    // `useStore` internally). The mocked stub is a plain function, so
    // calling it directly here — with no renderer involved — is itself
    // part of the assertion: it only works because the mock is active.
    const session = useSession();

    expect(session).toEqual({
      data: null,
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: expect.any(Function),
    });
  });

  it("exposes every action method auth-client.ts reads off the client, none touching the network", async () => {
    expect(typeof signOut).toBe("function");
    expect(typeof revokeSessions).toBe("function");
    expect(typeof requestPasswordReset).toBe("function");
    expect(typeof resetPassword).toBe("function");

    // signIn/signUp are read as nested methods (`signIn.email(...)`) by
    // AuthScreen.tsx; the stub must support that shape without throwing.
    expect(typeof signIn.email).toBe("function");
    expect(typeof signUp.email).toBe("function");

    await expect(
      signIn.email({ email: "a@example.com", password: "x" }),
    ).resolves.toEqual({ data: null, error: null });
  });
});
