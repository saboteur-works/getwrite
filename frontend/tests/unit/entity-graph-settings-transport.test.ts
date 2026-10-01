/**
 * Feature 68 Task 6: lib/api/entity-graph-settings.ts (HTTP transport) and its
 * native backend, mirroring word-count-goal-transport.test.ts's structure.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getEntityGraphSettings,
  httpEntityGraphSettingsTransport,
  setEntityGraphSettings,
} from "../../src/lib/api/entity-graph-settings";
import { reportTransportValidationFailure } from "../../src/lib/api/transport-validation";
import { createNativeEntityGraphSettingsTransport } from "../../src/store/transport/native-entity-graph-settings-backend";
import * as entityGraphSettingsCore from "../../src/lib/models/entity-graph-settings-core";
import { createFakeCapacitorFilesystem } from "../../src/lib/models/capacitor-filesystem";

vi.mock("../../src/lib/api/transport-validation", () => ({
  reportTransportValidationFailure: vi.fn(),
  reportTransportReadFailure: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("getEntityGraphSettings — HTTP", () => {
  it("GETs with projectId as a query param and returns the settings", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          entityGraphConnectionTypes: ["authored", "cooccurrence"],
          entityGraphFocalHopRadius: 1,
        }),
      } as Response);

    await expect(getEntityGraphSettings("p")).resolves.toEqual({
      entityGraphConnectionTypes: ["authored", "cooccurrence"],
      entityGraphFocalHopRadius: 1,
    });

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/project/entity-graph-settings?projectId=p");
  });

  it("rejects on a non-2xx response with the server's message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "Invalid projectId" }),
    } as Response);

    await expect(getEntityGraphSettings("p")).rejects.toThrow(
      "Invalid projectId",
    );
  });

  it("rejects on a network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    await expect(getEntityGraphSettings("p")).rejects.toThrow();
  });

  it("reports and rejects on a malformed body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ entityGraphConnectionTypes: "x" }),
    } as Response);

    await expect(getEntityGraphSettings("p")).rejects.toThrow();
    expect(reportTransportValidationFailure).toHaveBeenCalledWith(
      "entity-graph-settings.getEntityGraphSettings",
      expect.any(Array),
    );
  });
});

describe("setEntityGraphSettings — HTTP", () => {
  it("PUTs projectId, connection types, and hop radius, and returns the stored settings", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          entityGraphConnectionTypes: ["authored"],
          entityGraphFocalHopRadius: 2,
        }),
      } as Response);

    await expect(setEntityGraphSettings("p", ["authored"], 2)).resolves.toEqual(
      {
        entityGraphConnectionTypes: ["authored"],
        entityGraphFocalHopRadius: 2,
      },
    );

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/project/entity-graph-settings");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual({
      projectId: "p",
      entityGraphConnectionTypes: ["authored"],
      entityGraphFocalHopRadius: 2,
    });
  });

  it("rejects on a non-2xx response with the server's message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "Invalid entityGraphFocalHopRadius" }),
    } as Response);

    await expect(setEntityGraphSettings("p", ["authored"], -1)).rejects.toThrow(
      "Invalid entityGraphFocalHopRadius",
    );
  });

  it("rejects on a network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    await expect(
      setEntityGraphSettings("p", ["authored"], 1),
    ).rejects.toThrow();
  });

  it("reports and rejects on a malformed body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ entityGraphFocalHopRadius: "x" }),
    } as Response);

    await expect(
      setEntityGraphSettings("p", ["authored"], 1),
    ).rejects.toThrow();
    expect(reportTransportValidationFailure).toHaveBeenCalledWith(
      "entity-graph-settings.setEntityGraphSettings",
      expect.any(Array),
    );
  });

  it("exposes the http transport object", () => {
    expect(typeof httpEntityGraphSettingsTransport.getEntityGraphSettings).toBe(
      "function",
    );
    expect(typeof httpEntityGraphSettingsTransport.setEntityGraphSettings).toBe(
      "function",
    );
  });
});

describe("native backend", () => {
  function nativeTransport() {
    const fsLike = createFakeCapacitorFilesystem();
    return createNativeEntityGraphSettingsTransport({
      fs: fsLike,
      projectsDir: "/projects",
    });
  }

  it("calls getEntityGraphSettingsCore directly and returns the same shape as HTTP for the same fixture", async () => {
    const coreSpy = vi
      .spyOn(entityGraphSettingsCore, "getEntityGraphSettingsCore")
      .mockResolvedValue({
        entityGraphConnectionTypes: ["authored"],
        entityGraphFocalHopRadius: 1,
      });

    const native = nativeTransport();
    const result = await native.getEntityGraphSettings("proj-1");

    expect(coreSpy).toHaveBeenCalledWith("proj-1");
    expect(result).toEqual({
      entityGraphConnectionTypes: ["authored"],
      entityGraphFocalHopRadius: 1,
    });
  });

  it("calls setEntityGraphSettingsCore directly and returns the same shape as HTTP for the same fixture", async () => {
    const coreSpy = vi
      .spyOn(entityGraphSettingsCore, "setEntityGraphSettingsCore")
      .mockResolvedValue({
        entityGraphConnectionTypes: ["authored", "backlinks"],
        entityGraphFocalHopRadius: 3,
      });

    const native = nativeTransport();
    const result = await native.setEntityGraphSettings(
      "proj-1",
      ["authored", "backlinks"],
      3,
    );

    expect(coreSpy).toHaveBeenCalledWith(
      "proj-1",
      ["authored", "backlinks"],
      3,
    );
    expect(result).toEqual({
      entityGraphConnectionTypes: ["authored", "backlinks"],
      entityGraphFocalHopRadius: 3,
    });
  });

  it("propagates (does not swallow) a rejection from the core", async () => {
    const error = new Error("boom");
    vi.spyOn(
      entityGraphSettingsCore,
      "getEntityGraphSettingsCore",
    ).mockRejectedValue(error);

    const native = nativeTransport();
    await expect(native.getEntityGraphSettings("proj-1")).rejects.toThrow(
      "boom",
    );
  });
});
