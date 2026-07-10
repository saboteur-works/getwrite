import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  devIdentitySource,
  getIdentitySource,
} from "../../app/api/_lib/identity-source";

describe("devIdentitySource", () => {
  let savedEnv: string | undefined;

  beforeEach(() => {
    savedEnv = process.env.GETWRITE_ENABLE_DEV_IDENTITY;
    delete process.env.GETWRITE_ENABLE_DEV_IDENTITY;
    // Force an inert call while the flag is unset so the module's
    // one-time-warning state resets before each test, regardless of
    // whether a prior test left the flag active.
    devIdentitySource.getUserId(new Request("http://localhost"));
  });

  afterEach(() => {
    if (savedEnv === undefined) {
      delete process.env.GETWRITE_ENABLE_DEV_IDENTITY;
    } else {
      process.env.GETWRITE_ENABLE_DEV_IDENTITY = savedEnv;
    }
  });

  it("returns null when the flag is unset, even with the dev header present (inertness, FR4)", () => {
    const request = new Request("http://localhost", {
      headers: { "x-getwrite-dev-user": "alice" },
    });

    expect(devIdentitySource.getUserId(request)).toBeNull();
  });

  it("never calls console.warn when the flag is unset", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const request = new Request("http://localhost", {
      headers: { "x-getwrite-dev-user": "alice" },
    });

    devIdentitySource.getUserId(request);
    devIdentitySource.getUserId(request);

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("returns the header value when the flag is set and the header is present", () => {
    process.env.GETWRITE_ENABLE_DEV_IDENTITY = "1";
    const request = new Request("http://localhost", {
      headers: { "x-getwrite-dev-user": "alice" },
    });

    expect(devIdentitySource.getUserId(request)).toBe("alice");
  });

  it("returns null when the flag is set but the header is absent", () => {
    process.env.GETWRITE_ENABLE_DEV_IDENTITY = "1";
    const request = new Request("http://localhost");

    expect(devIdentitySource.getUserId(request)).toBeNull();
  });

  it("emits a console.warn when the flag activates", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.GETWRITE_ENABLE_DEV_IDENTITY = "1";
    const request = new Request("http://localhost", {
      headers: { "x-getwrite-dev-user": "alice" },
    });

    devIdentitySource.getUserId(request);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain(
      "GETWRITE_ENABLE_DEV_IDENTITY",
    );
    warnSpy.mockRestore();
  });

  it("does not re-warn on repeated calls within one activation", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.GETWRITE_ENABLE_DEV_IDENTITY = "1";
    const request = new Request("http://localhost", {
      headers: { "x-getwrite-dev-user": "alice" },
    });

    devIdentitySource.getUserId(request);
    devIdentitySource.getUserId(request);
    devIdentitySource.getUserId(request);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });
});

describe("getIdentitySource", () => {
  let savedEnv: string | undefined;

  beforeEach(() => {
    savedEnv = process.env.GETWRITE_ENABLE_DEV_IDENTITY;
    delete process.env.GETWRITE_ENABLE_DEV_IDENTITY;
  });

  afterEach(() => {
    if (savedEnv === undefined) {
      delete process.env.GETWRITE_ENABLE_DEV_IDENTITY;
    } else {
      process.env.GETWRITE_ENABLE_DEV_IDENTITY = savedEnv;
    }
  });

  it("behaves like devIdentitySource when the flag is set", () => {
    process.env.GETWRITE_ENABLE_DEV_IDENTITY = "1";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const request = new Request("http://localhost", {
      headers: { "x-getwrite-dev-user": "bob" },
    });

    expect(getIdentitySource().getUserId(request)).toBe("bob");
    warnSpy.mockRestore();
  });

  it("returns a null source when the flag is unset, regardless of headers", () => {
    const request = new Request("http://localhost", {
      headers: { "x-getwrite-dev-user": "bob" },
    });

    expect(getIdentitySource().getUserId(request)).toBeNull();
  });
});
