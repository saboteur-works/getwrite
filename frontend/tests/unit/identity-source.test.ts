import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { isHostedAuthActiveMock, getAuthServerMock, getSessionMock } =
  vi.hoisted(() => ({
    isHostedAuthActiveMock: vi.fn(),
    getAuthServerMock: vi.fn(),
    getSessionMock: vi.fn(),
  }));

vi.mock("../../src/lib/auth/auth-config", () => ({
  isHostedAuthActive: isHostedAuthActiveMock,
}));

vi.mock("../../src/lib/auth/auth-server", () => ({
  getAuthServer: getAuthServerMock,
}));

import {
  devIdentitySource,
  betterAuthIdentitySource,
  getIdentitySource,
} from "../../app/api/_tenant/identity-source";

beforeEach(() => {
  // Default every test to the pre-Slice-6 world (hosted auth inactive)
  // unless a test explicitly opts into the hosted-auth-active branch, so the
  // existing dev/null-source regression tests below observe unchanged
  // behavior without setting any new env/mock themselves.
  isHostedAuthActiveMock.mockReset().mockReturnValue(false);
  getAuthServerMock
    .mockReset()
    .mockReturnValue({ api: { getSession: getSessionMock } });
  getSessionMock.mockReset();
});

describe("devIdentitySource (pure header read)", () => {
  it("returns the dev header value when present", () => {
    const request = new Request("http://localhost", {
      headers: { "x-getwrite-dev-user": "alice" },
    });

    expect(devIdentitySource.getUserId(request)).toBe("alice");
  });

  it("returns null when the dev header is absent", () => {
    expect(
      devIdentitySource.getUserId(new Request("http://localhost")),
    ).toBeNull();
  });

  it("returns null when the dev header is empty", () => {
    const request = new Request("http://localhost", {
      headers: { "x-getwrite-dev-user": "" },
    });

    expect(devIdentitySource.getUserId(request)).toBeNull();
  });
});

describe("getIdentitySource", () => {
  let savedEnv: string | undefined;

  beforeEach(() => {
    savedEnv = process.env.GETWRITE_ENABLE_DEV_IDENTITY;
    delete process.env.GETWRITE_ENABLE_DEV_IDENTITY;
    // Observe the unset flag once so the module's one-time-warning state
    // resets before each test — getIdentitySource performs this reset on the
    // unset path (the real, per-request call path), regardless of whether a
    // prior test left the flag active.
    getIdentitySource();
  });

  afterEach(() => {
    if (savedEnv === undefined) {
      delete process.env.GETWRITE_ENABLE_DEV_IDENTITY;
    } else {
      process.env.GETWRITE_ENABLE_DEV_IDENTITY = savedEnv;
    }
  });

  it("returns a source that reads the dev header when the flag is set", () => {
    process.env.GETWRITE_ENABLE_DEV_IDENTITY = "1";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const request = new Request("http://localhost", {
      headers: { "x-getwrite-dev-user": "bob" },
    });

    expect(getIdentitySource().getUserId(request)).toBe("bob");
    warnSpy.mockRestore();
  });

  it("returns an inert null source when the flag is unset, even with the dev header present (inertness, FR4)", () => {
    const request = new Request("http://localhost", {
      headers: { "x-getwrite-dev-user": "bob" },
    });

    expect(getIdentitySource().getUserId(request)).toBeNull();
  });

  it("never calls console.warn when the flag is unset", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    getIdentitySource();
    getIdentitySource();

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("emits a single loud console.warn when the flag activates", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.GETWRITE_ENABLE_DEV_IDENTITY = "1";

    getIdentitySource();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain(
      "GETWRITE_ENABLE_DEV_IDENTITY",
    );
    warnSpy.mockRestore();
  });

  it("does not re-warn on repeated calls within one activation", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.GETWRITE_ENABLE_DEV_IDENTITY = "1";

    getIdentitySource();
    getIdentitySource();
    getIdentitySource();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it("re-warns after the flag is toggled off and back on (via the real call path)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    process.env.GETWRITE_ENABLE_DEV_IDENTITY = "1";
    getIdentitySource(); // activation → warns
    delete process.env.GETWRITE_ENABLE_DEV_IDENTITY;
    getIdentitySource(); // observes unset → resets the one-time flag
    process.env.GETWRITE_ENABLE_DEV_IDENTITY = "1";
    getIdentitySource(); // re-activation → warns again

    expect(warnSpy).toHaveBeenCalledTimes(2);
    warnSpy.mockRestore();
  });
});

describe("betterAuthIdentitySource", () => {
  it("resolves to the session's mapped userId when a valid session exists", async () => {
    getSessionMock.mockResolvedValue({
      session: { id: "sess-1", userId: "0f9a1b2c-...-uuid" },
      user: { id: "0f9a1b2c-...-uuid", email: "alice@example.com" },
    });
    const request = new Request("http://localhost");

    await expect(betterAuthIdentitySource.getUserId(request)).resolves.toBe(
      "0f9a1b2c-...-uuid",
    );
    expect(getSessionMock).toHaveBeenCalledWith({ headers: request.headers });
  });

  it("resolves to null when getSession resolves to null (no valid session)", async () => {
    getSessionMock.mockResolvedValue(null);
    const request = new Request("http://localhost");

    await expect(
      betterAuthIdentitySource.getUserId(request),
    ).resolves.toBeNull();
  });

  it("propagates a thrown error from getSession rather than swallowing it to null", async () => {
    const dbError = new Error("connection to postgres failed");
    getSessionMock.mockRejectedValue(dbError);
    const request = new Request("http://localhost");

    await expect(betterAuthIdentitySource.getUserId(request)).rejects.toBe(
      dbError,
    );
  });
});

describe("getIdentitySource precedence (Slice 6, FR7)", () => {
  it("returns betterAuthIdentitySource when hosted auth is active", () => {
    isHostedAuthActiveMock.mockReturnValue(true);

    expect(getIdentitySource()).toBe(betterAuthIdentitySource);
  });

  it("returns betterAuthIdentitySource when hosted auth is active, even if GETWRITE_ENABLE_DEV_IDENTITY is also set (security-boundary precedence)", () => {
    isHostedAuthActiveMock.mockReturnValue(true);
    process.env.GETWRITE_ENABLE_DEV_IDENTITY = "1";

    expect(getIdentitySource()).toBe(betterAuthIdentitySource);

    delete process.env.GETWRITE_ENABLE_DEV_IDENTITY;
  });

  it("returns devIdentitySource when hosted auth is inactive and the dev flag is set (regression)", () => {
    isHostedAuthActiveMock.mockReturnValue(false);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.GETWRITE_ENABLE_DEV_IDENTITY = "1";

    expect(getIdentitySource()).toBe(devIdentitySource);

    delete process.env.GETWRITE_ENABLE_DEV_IDENTITY;
    warnSpy.mockRestore();
  });

  it("returns the null source when hosted auth is inactive and the dev flag is unset (regression)", () => {
    isHostedAuthActiveMock.mockReturnValue(false);
    delete process.env.GETWRITE_ENABLE_DEV_IDENTITY;

    const source = getIdentitySource();

    expect(source).not.toBe(devIdentitySource);
    expect(source).not.toBe(betterAuthIdentitySource);
    expect(source.getUserId(new Request("http://localhost"))).toBeNull();
  });
});
