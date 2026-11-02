/**
 * Feature 98 Task 7: lib/api/goal-filter.ts (HTTP transport), its native
 * backend, and the web-stub's export parity.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  httpGoalFilterTransport,
  setGoalFilter,
} from "../../src/lib/api/goal-filter";
import { reportTransportValidationFailure } from "../../src/lib/api/transport-validation";
import * as nativeBackend from "../../src/store/transport/native-goal-filter-backend";
import * as webStub from "../../src/store/transport/native-goal-filter-backend.web-stub";
import * as goalFilterCore from "../../src/lib/models/goal-filter-core";
import { createFakeCapacitorFilesystem } from "../../src/lib/models/capacitor-filesystem";

vi.mock("../../src/lib/api/transport-validation", () => ({
  reportTransportValidationFailure: vi.fn(),
  reportTransportReadFailure: vi.fn(),
}));

const VALID = { op: "eq", field: "status", value: "draft" };

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("setGoalFilter — HTTP", () => {
  it("PUTs projectId and goalFilter, and returns the stored filter", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => ({ goalFilter: VALID }),
      } as Response);

    await expect(setGoalFilter("p", VALID)).resolves.toEqual({
      goalFilter: VALID,
    });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/project/goal-filter");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual({
      projectId: "p",
      goalFilter: VALID,
    });
  });

  it("clears (null) and accepts an empty object response", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
    await expect(setGoalFilter("p", null)).resolves.toEqual({
      goalFilter: undefined,
    });
    expect(JSON.parse(String(fetchSpy.mock.calls[0][1]?.body))).toEqual({
      projectId: "p",
      goalFilter: null,
    });
  });

  it("rejects on a non-2xx response with the server's message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: "A goal filter needs at least one condition.",
      }),
    } as Response);
    await expect(setGoalFilter("p", VALID)).rejects.toThrow(
      "A goal filter needs at least one condition.",
    );
  });

  it("rejects with a status fallback when the error body is unreadable", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);
    await expect(setGoalFilter("p", VALID)).rejects.toThrow(/HTTP 500/);
  });

  it("rejects on a network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    await expect(setGoalFilter("p", VALID)).rejects.toThrow("offline");
  });

  it("reports a malformed body without passing the body, and rejects", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ goalFilter: { op: "SECRET-BODY-VALUE" } }),
    } as Response);

    await expect(setGoalFilter("p", VALID)).rejects.toThrow();
    expect(reportTransportValidationFailure).toHaveBeenCalledTimes(1);
    const args = vi.mocked(reportTransportValidationFailure).mock.calls[0];
    expect(args[0]).toBe("goal-filter.setGoalFilter");
    expect(args).toHaveLength(2);
    expect(Array.isArray(args[1])).toBe(true);
    expect(JSON.stringify(args)).not.toContain("SECRET-BODY-VALUE");
  });

  it("exposes the http transport object", () => {
    expect(typeof httpGoalFilterTransport.setGoalFilter).toBe("function");
  });
});

describe("native backend", () => {
  function nativeTransport() {
    return nativeBackend.createNativeGoalFilterTransport({
      fs: createFakeCapacitorFilesystem(),
      projectsDir: "/projects",
    });
  }

  it("calls setGoalFilterCore directly", async () => {
    const coreSpy = vi
      .spyOn(goalFilterCore, "setGoalFilterCore")
      .mockResolvedValue({ goalFilter: VALID });
    await expect(
      nativeTransport().setGoalFilter("proj-1", VALID),
    ).resolves.toEqual({ goalFilter: VALID });
    expect(coreSpy).toHaveBeenCalledWith("proj-1", VALID);
  });

  it("passes null (clear) through", async () => {
    const coreSpy = vi
      .spyOn(goalFilterCore, "setGoalFilterCore")
      .mockResolvedValue({ goalFilter: undefined });
    await expect(
      nativeTransport().setGoalFilter("proj-1", null),
    ).resolves.toEqual({ goalFilter: undefined });
    expect(coreSpy).toHaveBeenCalledWith("proj-1", null);
  });

  it("propagates a refusal from the core with its message", async () => {
    vi.spyOn(goalFilterCore, "setGoalFilterCore").mockRejectedValue(
      new goalFilterCore.InvalidGoalFilterError(
        "ref",
        "A goal filter can't refer to a saved query.",
      ),
    );
    await expect(
      nativeTransport().setGoalFilter("proj-1", { op: "ref", id: "q" }),
    ).rejects.toThrow("A goal filter can't refer to a saved query.");
  });
});

describe("web-stub", () => {
  it("exports the same names as the native backend", () => {
    expect(Object.keys(webStub).sort()).toEqual(
      Object.keys(nativeBackend).sort(),
    );
  });

  it("throws if ever reached", () => {
    expect(() => webStub.createNativeGoalFilterTransport()).toThrow(/web-stub/);
  });
});
