import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  devIdentitySource,
  getIdentitySource,
} from "../../app/api/_lib/identity-source";

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
