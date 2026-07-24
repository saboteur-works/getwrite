/**
 * Unit tests for `shouldRedirectToLogin` — the pure decision core behind
 * `app/(app)/layout.tsx`'s page-route protection (Slice 6, FR20,
 * `specs/features/auth-provider.md`).
 *
 * `isHostedAuthActive` and `getAuthServer` are mocked so each test can drive
 * the exact hosted-auth-active / session-resolution combination it needs
 * without a real database. `server-only` is mocked for the same reason as
 * `auth-config.test.ts`.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { isHostedAuthActiveMock, getSessionMock, getAuthServerMock } =
  vi.hoisted(() => {
    const getSessionMock = vi.fn();
    return {
      isHostedAuthActiveMock: vi.fn(),
      getSessionMock,
      getAuthServerMock: vi.fn(() => ({ api: { getSession: getSessionMock } })),
    };
  });
vi.mock("../../src/lib/auth/auth-config", () => ({
  isHostedAuthActive: isHostedAuthActiveMock,
}));
vi.mock("../../src/lib/auth/auth-server", () => ({
  getAuthServer: getAuthServerMock,
}));

import { shouldRedirectToLogin } from "../../src/lib/auth/session-guard";

describe("shouldRedirectToLogin", () => {
  beforeEach(() => {
    isHostedAuthActiveMock.mockReset();
    getSessionMock.mockReset();
    getAuthServerMock.mockClear();
  });

  it("resolves false when hosted auth is inactive, without reading any session", async () => {
    isHostedAuthActiveMock.mockReturnValue(false);

    const shouldRedirect = await shouldRedirectToLogin(new Headers());

    expect(shouldRedirect).toBe(false);
    expect(getAuthServerMock).not.toHaveBeenCalled();
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it("resolves true when hosted auth is active and there is no valid session", async () => {
    isHostedAuthActiveMock.mockReturnValue(true);
    getSessionMock.mockResolvedValue(null);
    const requestHeaders = new Headers({ cookie: "better-auth.session=none" });

    const shouldRedirect = await shouldRedirectToLogin(requestHeaders);

    expect(shouldRedirect).toBe(true);
    expect(getSessionMock).toHaveBeenCalledWith({ headers: requestHeaders });
  });

  it("resolves false when hosted auth is active and a valid session exists", async () => {
    isHostedAuthActiveMock.mockReturnValue(true);
    getSessionMock.mockResolvedValue({
      session: { id: "s-1" },
      user: { id: "u-1" },
    });

    const shouldRedirect = await shouldRedirectToLogin(new Headers());

    expect(shouldRedirect).toBe(false);
  });

  it("propagates a thrown error rather than treating it as no-session", async () => {
    isHostedAuthActiveMock.mockReturnValue(true);
    const dbError = new Error("connection refused");
    getSessionMock.mockRejectedValue(dbError);

    await expect(shouldRedirectToLogin(new Headers())).rejects.toThrow(
      "connection refused",
    );
  });
});
