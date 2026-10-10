// Feature 77, Task 14 (FR-19, FR-20): the client limits read. Unlike
// auth-status, a failure must reject and never be returned as `exempt`.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSharingLimits } from "../../src/store/sharing-limits-transport-service";
import * as transportValidation from "../../src/lib/api/transport-validation";

const RUNTIME_ENV = "NEXT_PUBLIC_GETWRITE_RUNTIME";
const originalRuntime = process.env[RUNTIME_ENV];

const LIMITS = {
  projectDeletion: true,
  unlocking: false,
  locking: true,
  encryptionChanges: false,
  permanentDeletion: true,
};

function respond(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

afterEach(() => {
  if (originalRuntime === undefined) delete process.env[RUNTIME_ENV];
  else process.env[RUNTIME_ENV] = originalRuntime;
  vi.restoreAllMocks();
});

describe("fetchSharingLimits — web runtime", () => {
  beforeEach(() => {
    delete process.env[RUNTIME_ENV];
  });

  it("maps { role: 'exempt' } to { state: 'exempt' } and reads uncached", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(respond({ role: "exempt" }));
    await expect(fetchSharingLimits()).resolves.toEqual({ state: "exempt" });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("/api/sharing/limits", {
      cache: "no-store",
    });
  });

  it("maps a paired answer to { state: 'paired', limits }", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      respond({ role: "paired", limits: LIMITS }),
    );
    await expect(fetchSharingLimits()).resolves.toEqual({
      state: "paired",
      limits: LIMITS,
    });
  });

  it("rejects on a network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    await expect(fetchSharingLimits()).rejects.toThrow();
  });

  it("rejects on a non-OK response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(respond({}, false, 401));
    await expect(fetchSharingLimits()).rejects.toThrow(/401/);
  });

  it("rejects and reports (without the body) when the body fails validation", async () => {
    const report = vi
      .spyOn(transportValidation, "reportTransportValidationFailure")
      .mockImplementation(() => undefined);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      respond({ role: "paired", limits: { unlocking: "SECRET-BODY" } }),
    );
    await expect(fetchSharingLimits()).rejects.toThrow();
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0][0]).toBe("sharing-limits.fetchSharingLimits");
    expect(JSON.stringify(report.mock.calls[0])).not.toContain("SECRET-BODY");
  });

  it("rejects an unknown role", async () => {
    vi.spyOn(
      transportValidation,
      "reportTransportValidationFailure",
    ).mockImplementation(() => undefined);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(respond({ role: "admin" }));
    await expect(fetchSharingLimits()).rejects.toThrow();
  });
});

describe("fetchSharingLimits — native runtime", () => {
  beforeEach(() => {
    process.env[RUNTIME_ENV] = "native";
  });

  it("resolves { state: 'exempt' } without calling fetch", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    await expect(fetchSharingLimits()).resolves.toEqual({ state: "exempt" });
    expect(spy).not.toHaveBeenCalled();
  });
});
