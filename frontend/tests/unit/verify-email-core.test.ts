/**
 * Unit tests for `verifyEmailToken` — the pure decision core behind
 * `app/verify-email/page.tsx` (Slice 6, FR21, `specs/features/auth-provider.md`).
 *
 * Mirrors `session-guard.test.ts`'s mocking approach: `isHostedAuthActive`
 * and `getAuthServer` are mocked so each test can drive the exact
 * hosted-auth-active / token-outcome combination it needs without a real
 * database.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { isHostedAuthActiveMock, verifyEmailMock, getAuthServerMock } =
  vi.hoisted(() => {
    const verifyEmailMock = vi.fn();
    return {
      isHostedAuthActiveMock: vi.fn(),
      verifyEmailMock,
      getAuthServerMock: vi.fn(() => ({
        api: { verifyEmail: verifyEmailMock },
      })),
    };
  });
vi.mock("../../src/lib/auth/auth-config", () => ({
  isHostedAuthActive: isHostedAuthActiveMock,
}));
vi.mock("../../src/lib/auth/auth-server", () => ({
  getAuthServer: getAuthServerMock,
}));

import { verifyEmailToken } from "../../src/lib/auth/verify-email-core";

describe("verifyEmailToken", () => {
  beforeEach(() => {
    isHostedAuthActiveMock.mockReset();
    verifyEmailMock.mockReset();
    getAuthServerMock.mockClear();
  });

  it("resolves not-applicable when hosted auth is inactive, without calling verifyEmail", async () => {
    isHostedAuthActiveMock.mockReturnValue(false);

    const outcome = await verifyEmailToken("some-token");

    expect(outcome).toEqual({ status: "not-applicable" });
    expect(getAuthServerMock).not.toHaveBeenCalled();
    expect(verifyEmailMock).not.toHaveBeenCalled();
  });

  it("resolves missing-token when hosted auth is active and no token is supplied", async () => {
    isHostedAuthActiveMock.mockReturnValue(true);

    const outcome = await verifyEmailToken(undefined);

    expect(outcome).toEqual({ status: "missing-token" });
    expect(verifyEmailMock).not.toHaveBeenCalled();
  });

  it("resolves success when better-auth accepts the token", async () => {
    isHostedAuthActiveMock.mockReturnValue(true);
    verifyEmailMock.mockResolvedValue({ status: true });

    const outcome = await verifyEmailToken("valid-token");

    expect(outcome).toEqual({ status: "success" });
    expect(verifyEmailMock).toHaveBeenCalledWith({
      query: { token: "valid-token" },
    });
  });

  it("resolves failure when better-auth rejects an invalid or expired token", async () => {
    isHostedAuthActiveMock.mockReturnValue(true);
    verifyEmailMock.mockRejectedValue(new Error("INVALID_TOKEN"));

    const outcome = await verifyEmailToken("expired-token");

    expect(outcome).toEqual({ status: "failure" });
  });
});
