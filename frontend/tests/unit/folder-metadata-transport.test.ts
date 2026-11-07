/**
 * Feature 102 Task 9: lib/api/folder-metadata.ts (HTTP transport), its native
 * backend and the web-stub's export parity.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getFolderMetadata,
  updateFolderMetadata,
} from "../../src/lib/api/folder-metadata";
import { reportTransportValidationFailure } from "../../src/lib/api/transport-validation";
import * as nativeBackend from "../../src/store/transport/native-folder-metadata-backend";
import * as webStub from "../../src/store/transport/native-folder-metadata-backend.web-stub";
import * as core from "../../src/lib/models/folder-metadata-core";
import { createFakeCapacitorFilesystem } from "../../src/lib/models/capacitor-filesystem";

vi.mock("../../src/lib/api/transport-validation", () => ({
  reportTransportValidationFailure: vi.fn(),
  reportTransportReadFailure: vi.fn(),
}));

const VALUE = {
  notes: "n",
  fieldValues: { mood: "calm" },
  resourceSubtype: "Act",
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("HTTP", () => {
  it("GETs with projectId and folderId and returns the value", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true, json: async () => VALUE } as Response);
    await expect(getFolderMetadata("p", "f")).resolves.toEqual(VALUE);
    expect(String(spy.mock.calls[0][0])).toBe(
      "/api/project/folder-metadata?projectId=p&folderId=f",
    );
  });

  it("PUTs projectId, folderId and metadata", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => ({ notes: "n", fieldValues: {} }),
      } as Response);
    await expect(
      updateFolderMetadata("p", "f", { notes: "n" }),
    ).resolves.toEqual({
      notes: "n",
      fieldValues: {},
      resourceSubtype: undefined,
    });
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe("/api/project/folder-metadata");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual({
      projectId: "p",
      folderId: "f",
      metadata: { notes: "n" },
    });
  });

  it("rejects with the server's message on non-2xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "notes must be a string" }),
    } as Response);
    await expect(updateFolderMetadata("p", "f", { notes: 1 })).rejects.toThrow(
      "notes must be a string",
    );
  });

  it("rejects, never resolves empty, on a failed read", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);
    await expect(getFolderMetadata("p", "f")).rejects.toThrow(/HTTP 500/);
  });

  it("reports a malformed body without passing it, and rejects", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ notes: 5, secret: "SECRET-BODY-VALUE" }),
    } as Response);
    await expect(getFolderMetadata("p", "f")).rejects.toThrow();
    expect(reportTransportValidationFailure).toHaveBeenCalledTimes(1);
    const args = vi.mocked(reportTransportValidationFailure).mock.calls[0];
    expect(args[0]).toBe("folder-metadata.getFolderMetadata");
    expect(JSON.stringify(args)).not.toContain("SECRET-BODY-VALUE");
  });
});

describe("native backend", () => {
  const transport = () =>
    nativeBackend.createNativeFolderMetadataTransport({
      fs: createFakeCapacitorFilesystem(),
      projectsDir: "/projects",
    });

  it("calls the cores directly", async () => {
    const g = vi.spyOn(core, "getFolderMetadataCore").mockResolvedValue(VALUE);
    const u = vi
      .spyOn(core, "updateFolderMetadataCore")
      .mockResolvedValue(VALUE);
    await expect(transport().getFolderMetadata("p", "f")).resolves.toEqual(
      VALUE,
    );
    await expect(
      transport().updateFolderMetadata("p", "f", { notes: "n" }),
    ).resolves.toEqual(VALUE);
    expect(g).toHaveBeenCalledWith("p", "f");
    expect(u).toHaveBeenCalledWith("p", "f", { notes: "n" });
  });

  it("propagates a refusal with its message", async () => {
    vi.spyOn(core, "updateFolderMetadataCore").mockRejectedValue(
      new core.InvalidFolderMetadataError("notes must be a string"),
    );
    await expect(
      transport().updateFolderMetadata("p", "f", { notes: 1 }),
    ).rejects.toThrow("notes must be a string");
  });
});

describe("web-stub", () => {
  it("exports the same names as the native backend", () => {
    expect(Object.keys(webStub).sort()).toEqual(
      Object.keys(nativeBackend).sort(),
    );
  });

  it("throws if ever reached", () => {
    expect(() => webStub.createNativeFolderMetadataTransport()).toThrow(
      /web-stub/,
    );
  });
});
