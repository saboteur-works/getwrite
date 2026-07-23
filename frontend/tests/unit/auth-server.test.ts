/**
 * Unit tests for `getAuthServer()` — the lazily-built, memoized
 * `betterAuth(...)` instance for GetWrite's hosted authentication path
 * (FR1/FR3/FR5/FR6/FR16/FR17, `specs/features/auth-provider.md`).
 *
 * `better-auth` and `pg` are mocked: no real Postgres is available in this
 * test environment, and the point of these tests is to assert (a) that
 * hosted-auth-inactive callers never reach either library at all, and (b)
 * the exact options `betterAuth(...)` is called with when active.
 * `server-only` is mocked for the same reason as in `auth-config.test.ts`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const {
  betterAuthMock,
  poolMock,
  sendResetPasswordMock,
  sendVerificationEmailMock,
} = vi.hoisted(() => {
  const poolMock = vi.fn(function (this: unknown, options: unknown) {
    Object.assign(this as object, { __poolOptions: options });
  });
  return {
    betterAuthMock: vi.fn((options: unknown) => ({ __options: options })),
    poolMock,
    sendResetPasswordMock: vi.fn(),
    sendVerificationEmailMock: vi.fn(),
  };
});
vi.mock("server-only", () => ({}));
vi.mock("better-auth", () => ({ betterAuth: betterAuthMock }));
vi.mock("pg", () => ({ Pool: poolMock }));
vi.mock("../../src/lib/auth/email", () => ({
  sendResetPassword: sendResetPasswordMock,
  sendVerificationEmail: sendVerificationEmailMock,
}));

import {
  getAuthServer,
  __resetAuthServerForTests,
  AuthServerNotActiveError,
} from "../../src/lib/auth/auth-server";

describe("getAuthServer", () => {
  let savedDatabaseUrl: string | undefined;
  let savedSecret: string | undefined;
  let savedBaseUrl: string | undefined;

  beforeEach(() => {
    savedDatabaseUrl = process.env.DATABASE_URL;
    savedSecret = process.env.BETTER_AUTH_SECRET;
    savedBaseUrl = process.env.BETTER_AUTH_URL;
    delete process.env.DATABASE_URL;
    delete process.env.BETTER_AUTH_SECRET;
    delete process.env.BETTER_AUTH_URL;
    betterAuthMock.mockClear();
    poolMock.mockClear();
    __resetAuthServerForTests();
  });

  afterEach(() => {
    if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedDatabaseUrl;
    if (savedSecret === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = savedSecret;
    if (savedBaseUrl === undefined) delete process.env.BETTER_AUTH_URL;
    else process.env.BETTER_AUTH_URL = savedBaseUrl;
    __resetAuthServerForTests();
  });

  it("throws AuthServerNotActiveError and never constructs Pool/betterAuth when hosted auth is inactive", () => {
    // No DATABASE_URL/BETTER_AUTH_SECRET set at all — not even a
    // syntactically invalid connection string reaches pg.Pool.
    expect(() => getAuthServer()).toThrow(AuthServerNotActiveError);
    expect(poolMock).not.toHaveBeenCalled();
    expect(betterAuthMock).not.toHaveBeenCalled();
  });

  it("throws the same typed error even when only one of the two required vars is set", () => {
    process.env.DATABASE_URL =
      "postgres://user:pass@localhost:5432/getwrite_dev";
    // BETTER_AUTH_SECRET intentionally left unset.
    expect(() => getAuthServer()).toThrow(AuthServerNotActiveError);
    expect(poolMock).not.toHaveBeenCalled();
    expect(betterAuthMock).not.toHaveBeenCalled();
  });

  describe("when hosted auth is active", () => {
    beforeEach(() => {
      process.env.DATABASE_URL =
        "postgres://user:pass@localhost:5432/getwrite_dev";
      process.env.BETTER_AUTH_SECRET = "test-secret";
    });

    it("constructs the instance without throwing", () => {
      expect(() => getAuthServer()).not.toThrow();
      expect(betterAuthMock).toHaveBeenCalledOnce();
      expect(poolMock).toHaveBeenCalledOnce();
    });

    it("memoizes: returns the same instance on a second call", () => {
      const first = getAuthServer();
      const second = getAuthServer();
      expect(second).toBe(first);
      expect(betterAuthMock).toHaveBeenCalledOnce();
      expect(poolMock).toHaveBeenCalledOnce();
    });

    it("passes advanced.database.generateId: 'uuid' and rateLimit.storage: 'database' to betterAuth()", () => {
      getAuthServer();
      expect(betterAuthMock).toHaveBeenCalledOnce();
      const options = betterAuthMock.mock.calls[0]![0] as {
        advanced: { database: { generateId: unknown } };
        rateLimit: { storage: unknown };
        session: { cookieCache: { enabled: unknown } };
        secret: unknown;
        baseURL: unknown;
      };
      expect(options.advanced.database.generateId).toBe("uuid");
      expect(options.rateLimit.storage).toBe("database");
      expect(options.session.cookieCache.enabled).toBe(true);
      expect(options.secret).toBe("test-secret");
    });

    it("wires the real nodemailer-backed email.ts callbacks (FR14), not a placeholder", () => {
      getAuthServer();
      const options = betterAuthMock.mock.calls[0]![0] as {
        emailAndPassword: { sendResetPassword: unknown };
        emailVerification: { sendVerificationEmail: unknown };
      };
      expect(options.emailAndPassword.sendResetPassword).toBe(
        sendResetPasswordMock,
      );
      expect(options.emailVerification.sendVerificationEmail).toBe(
        sendVerificationEmailMock,
      );
    });

    it("builds the Pool from DATABASE_URL", () => {
      getAuthServer();
      expect(poolMock).toHaveBeenCalledWith({
        connectionString: "postgres://user:pass@localhost:5432/getwrite_dev",
      });
    });

    it("defaults baseURL when BETTER_AUTH_URL is unset", () => {
      getAuthServer();
      const options = betterAuthMock.mock.calls[0]![0] as { baseURL: string };
      expect(options.baseURL).toBe("http://localhost:3000");
    });

    it("uses BETTER_AUTH_URL when configured", () => {
      process.env.BETTER_AUTH_URL = "https://getwrite.example.com";
      getAuthServer();
      const options = betterAuthMock.mock.calls[0]![0] as { baseURL: string };
      expect(options.baseURL).toBe("https://getwrite.example.com");
    });
  });
});
