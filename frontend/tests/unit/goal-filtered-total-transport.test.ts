/**
 * Feature 98 Task 8: lib/api/goal-filtered-total.ts (HTTP transport), its
 * native backend, and the web-stub's export parity.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getGoalFilteredTotal,
  httpGoalFilteredTotalTransport,
} from "../../src/lib/api/goal-filtered-total";
import { reportTransportValidationFailure } from "../../src/lib/api/transport-validation";
import * as nativeBackend from "../../src/store/transport/native-goal-total-backend";
import * as webStub from "../../src/store/transport/native-goal-total-backend.web-stub";
import * as totalCore from "../../src/lib/models/goal-filtered-total-core";
import * as projectRootResolver from "../../src/lib/models/project-root-resolver";
import { createFakeCapacitorFilesystem } from "../../src/lib/models/capacitor-filesystem";

vi.mock("../../src/lib/api/transport-validation", () => ({
  reportTransportValidationFailure: vi.fn(),
  reportTransportReadFailure: vi.fn(),
}));

function respond(body: unknown): void {
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: async () => body,
  } as Response);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("getGoalFilteredTotal — HTTP", () => {
  it("returns each typed result unchanged", async () => {
    const bodies: totalCore.GoalFilteredTotalResult[] = [
      { status: "not-filtered" },
      { status: "total", total: 12 },
      { status: "no-match", total: 0 },
      { status: "unavailable", reason: "invalid-filter", message: "bad" },
      { status: "unavailable", reason: "missing-field", fields: ["mood"] },
      { status: "unavailable", reason: "read-failed", cause: "locked" },
    ];
    for (const body of bodies) {
      vi.restoreAllMocks();
      respond(body);
      await expect(getGoalFilteredTotal("p")).resolves.toEqual(body);
    }
  });

  it("GETs with the encoded projectId", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => ({ status: "not-filtered" }),
      } as Response);
    await getGoalFilteredTotal("p&1");
    expect(fetchSpy.mock.calls[0][0]).toBe(
      "/api/project/goal-filtered-total?projectId=p%261",
    );
  });

  it("rejects with a status fallback and on a network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);
    await expect(getGoalFilteredTotal("p")).rejects.toThrow(/HTTP 500/);
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    await expect(getGoalFilteredTotal("p")).rejects.toThrow("offline");
  });

  it("rejects with the server's message on a non-2xx response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "Invalid projectId" }),
    } as Response);
    await expect(getGoalFilteredTotal("p")).rejects.toThrow(
      "Invalid projectId",
    );
  });

  it("reports a malformed body without the body, and rejects (never a number)", async () => {
    for (const bad of [
      { status: "total", total: "SECRET-BODY-VALUE" },
      { status: "unavailable", reason: "read-failed", total: 0 },
      { status: "SECRET-BODY-VALUE" },
      "SECRET-BODY-VALUE",
    ]) {
      vi.restoreAllMocks();
      vi.clearAllMocks();
      respond(bad);
      await expect(getGoalFilteredTotal("p")).rejects.toThrow();
      expect(reportTransportValidationFailure).toHaveBeenCalledTimes(1);
      const args = vi.mocked(reportTransportValidationFailure).mock.calls[0];
      expect(args[0]).toBe("goal-filtered-total.getGoalFilteredTotal");
      expect(args).toHaveLength(2);
      expect(JSON.stringify(args)).not.toContain("SECRET-BODY-VALUE");
    }
  });

  it("exposes the http transport object", () => {
    expect(typeof httpGoalFilteredTotalTransport.getGoalFilteredTotal).toBe(
      "function",
    );
  });
});

describe("native backend", () => {
  function nativeTransport() {
    return nativeBackend.createNativeGoalTotalTransport({
      fs: createFakeCapacitorFilesystem(),
      projectsDir: "/projects",
    });
  }

  it("resolves the root from the id and calls the one core", async () => {
    vi.spyOn(projectRootResolver, "resolveProjectRoot").mockReturnValue(
      "/projects/proj-1",
    );
    const coreSpy = vi
      .spyOn(totalCore, "evaluateGoalFilteredTotal")
      .mockResolvedValue({ status: "total", total: 7 });
    await expect(
      nativeTransport().getGoalFilteredTotal("proj-1"),
    ).resolves.toEqual({ status: "total", total: 7 });
    expect(coreSpy).toHaveBeenCalledTimes(1);
    expect(coreSpy.mock.calls[0][0]).toBe("/projects/proj-1");
    expect(coreSpy.mock.calls[0][1]).toBeInstanceOf(Date);
  });

  it("returns an unavailable result as a typed value", async () => {
    vi.spyOn(projectRootResolver, "resolveProjectRoot").mockReturnValue("/r");
    vi.spyOn(totalCore, "evaluateGoalFilteredTotal").mockResolvedValue({
      status: "unavailable",
      reason: "read-failed",
      cause: "corrupt",
    });
    const result = await nativeTransport().getGoalFilteredTotal("proj-1");
    expect(result).toEqual({
      status: "unavailable",
      reason: "read-failed",
      cause: "corrupt",
    });
    expect("total" in result).toBe(false);
  });

  it("rejects when the core throws, and for an unresolvable id", async () => {
    vi.spyOn(projectRootResolver, "resolveProjectRoot").mockReturnValue("/r");
    vi.spyOn(totalCore, "evaluateGoalFilteredTotal").mockRejectedValue(
      new Error("boom"),
    );
    await expect(nativeTransport().getGoalFilteredTotal("p")).rejects.toThrow(
      "boom",
    );
    vi.restoreAllMocks();
    vi.spyOn(projectRootResolver, "resolveProjectRoot").mockReturnValue(null);
    await expect(
      nativeTransport().getGoalFilteredTotal("bad"),
    ).rejects.toThrow();
  });
});

describe("web-stub", () => {
  it("exports the same names as the native backend", () => {
    expect(Object.keys(webStub).sort()).toEqual(
      Object.keys(nativeBackend).sort(),
    );
  });

  it("throws if ever reached", () => {
    expect(() => webStub.createNativeGoalTotalTransport()).toThrow(/web-stub/);
  });
});
