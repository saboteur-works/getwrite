/**
 * Feature 69 Task 4: lib/api/entity-graph-kind-styles.ts (HTTP transport)
 * and its native backend, mirroring entity-graph-settings-transport.test.ts
 * and entity-graph-positions-native-web-parity.test.ts's structure.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getEntityGraphKindStyles,
  httpEntityGraphKindStylesTransport,
  saveEntityGraphKindStyle,
} from "../../src/lib/api/entity-graph-kind-styles";
import { reportTransportValidationFailure } from "../../src/lib/api/transport-validation";
import { createNativeEntityGraphKindStylesTransport } from "../../src/store/transport/native-entity-graph-kind-styles-backend";
import { createNativeEntityGraphKindStylesTransport as createWebStubTransport } from "../../src/store/transport/native-entity-graph-kind-styles-backend.web-stub";
import * as entityGraphKindStylesModel from "../../src/lib/models/entity-graph-kind-styles";
import * as projectRootResolver from "../../src/lib/models/project-root-resolver";
import { createFakeCapacitorFilesystem } from "../../src/lib/models/capacitor-filesystem";

vi.mock("../../src/lib/api/transport-validation", () => ({
  reportTransportValidationFailure: vi.fn(),
  reportTransportReadFailure: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("getEntityGraphKindStyles — HTTP", () => {
  it("GETs with projectId as a query param and returns the styles", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => [
          { entityKind: "character", color: "entity-kind-0", shape: "circle" },
        ],
      } as Response);

    await expect(getEntityGraphKindStyles("p")).resolves.toEqual([
      { entityKind: "character", color: "entity-kind-0", shape: "circle" },
    ]);

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/project/entity-graph-kind-styles?projectId=p");
  });

  it("rejects on a non-2xx response with the server's message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "Invalid projectId" }),
    } as Response);

    await expect(getEntityGraphKindStyles("p")).rejects.toThrow(
      "Invalid projectId",
    );
  });

  it("rejects on a network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    await expect(getEntityGraphKindStyles("p")).rejects.toThrow();
  });

  it("reports and rejects on a malformed body (hex color literal)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [
        { entityKind: "character", color: "#D44040", shape: "circle" },
      ],
    } as Response);

    await expect(getEntityGraphKindStyles("p")).rejects.toThrow();
    expect(reportTransportValidationFailure).toHaveBeenCalledWith(
      "entity-graph-kind-styles.getEntityGraphKindStyles",
      expect.any(Array),
    );
  });

  it("reports and rejects on a malformed body (unknown shape)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [
        { entityKind: "character", color: "entity-kind-0", shape: "octagon" },
      ],
    } as Response);

    await expect(getEntityGraphKindStyles("p")).rejects.toThrow();
    expect(reportTransportValidationFailure).toHaveBeenCalledWith(
      "entity-graph-kind-styles.getEntityGraphKindStyles",
      expect.any(Array),
    );
  });
});

describe("saveEntityGraphKindStyle — HTTP", () => {
  it("PUTs projectId, entityKind, color, and shape, and returns the stored record", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          entityKind: "character",
          color: "entity-kind-1",
          shape: "square",
        }),
      } as Response);

    await expect(
      saveEntityGraphKindStyle("p", "character", "entity-kind-1", "square"),
    ).resolves.toEqual({
      entityKind: "character",
      color: "entity-kind-1",
      shape: "square",
    });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/project/entity-graph-kind-styles");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual({
      projectId: "p",
      entityKind: "character",
      color: "entity-kind-1",
      shape: "square",
    });
  });

  it("rejects on a non-2xx response with the server's message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "Invalid color" }),
    } as Response);

    await expect(
      saveEntityGraphKindStyle("p", "character", "entity-kind-1", "square"),
    ).rejects.toThrow("Invalid color");
  });

  it("rejects on a network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    await expect(
      saveEntityGraphKindStyle("p", "character", "entity-kind-1", "square"),
    ).rejects.toThrow();
  });

  it("reports and rejects on a malformed body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ entityKind: "character", color: "#fff" }),
    } as Response);

    await expect(
      saveEntityGraphKindStyle("p", "character", "entity-kind-1", "square"),
    ).rejects.toThrow();
    expect(reportTransportValidationFailure).toHaveBeenCalledWith(
      "entity-graph-kind-styles.saveEntityGraphKindStyle",
      expect.any(Array),
    );
  });

  it("exposes the http transport object", () => {
    expect(
      typeof httpEntityGraphKindStylesTransport.getEntityGraphKindStyles,
    ).toBe("function");
    expect(
      typeof httpEntityGraphKindStylesTransport.saveEntityGraphKindStyle,
    ).toBe("function");
  });
});

describe("native backend", () => {
  function nativeTransport() {
    vi.spyOn(projectRootResolver, "resolveProjectRoot").mockReturnValue(
      "/projects/proj-1",
    );
    return createNativeEntityGraphKindStylesTransport({
      fs: createFakeCapacitorFilesystem(),
      projectsDir: "/projects",
    });
  }

  it("calls loadEntityGraphKindStyles directly with the resolved project root", async () => {
    const modelSpy = vi
      .spyOn(entityGraphKindStylesModel, "loadEntityGraphKindStyles")
      .mockResolvedValue([
        { entityKind: "character", color: "entity-kind-0", shape: "circle" },
      ]);

    const native = nativeTransport();
    const result = await native.getEntityGraphKindStyles("proj-1");

    expect(modelSpy).toHaveBeenCalledWith("/projects/proj-1");
    expect(result).toEqual([
      { entityKind: "character", color: "entity-kind-0", shape: "circle" },
    ]);
  });

  it("calls upsertEntityGraphKindStyle directly with the resolved project root", async () => {
    const modelSpy = vi
      .spyOn(entityGraphKindStylesModel, "upsertEntityGraphKindStyle")
      .mockResolvedValue({
        entityKind: "place",
        color: "entity-kind-2",
        shape: "triangle",
      });

    const native = nativeTransport();
    const result = await native.saveEntityGraphKindStyle(
      "proj-1",
      "place",
      "entity-kind-2",
      "triangle",
    );

    expect(modelSpy).toHaveBeenCalledWith(
      "/projects/proj-1",
      "place",
      "entity-kind-2",
      "triangle",
    );
    expect(result).toEqual({
      entityKind: "place",
      color: "entity-kind-2",
      shape: "triangle",
    });
  });

  it("propagates (does not swallow) a rejection from the model layer", async () => {
    const error = new Error("boom");
    vi.spyOn(
      entityGraphKindStylesModel,
      "loadEntityGraphKindStyles",
    ).mockRejectedValue(error);

    const native = nativeTransport();
    await expect(native.getEntityGraphKindStyles("proj-1")).rejects.toThrow(
      "boom",
    );
  });

  it("rejects an invalid projectId", async () => {
    vi.spyOn(projectRootResolver, "resolveProjectRoot").mockReturnValue(null);
    const native = createNativeEntityGraphKindStylesTransport({
      fs: createFakeCapacitorFilesystem(),
      projectsDir: "/projects",
    });

    await expect(native.getEntityGraphKindStyles("not-a-uuid")).rejects.toThrow(
      "Invalid projectId",
    );
  });
});

describe("web-stub", () => {
  it("throws if ever reached", () => {
    expect(() => createWebStubTransport()).toThrow(
      /native-entity-graph-kind-styles-backend was reached in a web\/desktop build|native entity-graph-kind-styles transport was reached/,
    );
  });
});
