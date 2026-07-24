/**
 * Unit tests for `fetchAuthStatus` (Slice 6, FR21/FR22) — mirrors
 * `fetchUpdateCheck`'s never-throws, fail-safe-default contract.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchAuthStatus } from "../../src/store/auth-status-transport-service";

describe("fetchAuthStatus", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the parsed status on a successful response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ hostedAuthActive: true }),
    } as Response);

    await expect(fetchAuthStatus()).resolves.toEqual({
      hostedAuthActive: true,
    });
  });

  it("resolves hostedAuthActive: false on a non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({ hostedAuthActive: true }),
    } as Response);

    await expect(fetchAuthStatus()).resolves.toEqual({
      hostedAuthActive: false,
    });
  });

  it("resolves hostedAuthActive: false rather than throwing on a network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    await expect(fetchAuthStatus()).resolves.toEqual({
      hostedAuthActive: false,
    });
  });
});
