/**
 * Feature 101 Task 4 (FR-3): lib/api compile-defaults and export-defaults
 * clients (HTTP), their native backends, and the web-stubs' export parity.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  httpCompileDefaultsTransport,
  setCompileDefaults,
} from "../../src/lib/api/compile-defaults";
import {
  httpExportDefaultsTransport,
  setExportDefaults,
} from "../../src/lib/api/export-defaults";
import { reportTransportValidationFailure } from "../../src/lib/api/transport-validation";
import * as nativeCompile from "../../src/store/transport/native-compile-defaults-backend";
import * as nativeExport from "../../src/store/transport/native-export-defaults-backend";
import * as compileStub from "../../src/store/transport/native-compile-defaults-backend.web-stub";
import * as exportStub from "../../src/store/transport/native-export-defaults-backend.web-stub";
import * as core from "../../src/lib/models/saved-defaults-core";
import { createFakeCapacitorFilesystem } from "../../src/lib/models/capacitor-filesystem";

vi.mock("../../src/lib/api/transport-validation", () => ({
  reportTransportValidationFailure: vi.fn(),
  reportTransportReadFailure: vi.fn(),
}));

const ID = "11111111-1111-4111-8111-111111111111";

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const CASES = [
  {
    name: "compile",
    endpoint: "/api/project/compile-defaults",
    label: "compile-defaults.setCompileDefaults",
    set: setCompileDefaults,
    http: httpCompileDefaultsTransport,
    coreFn: "setCompileDefaultsCore",
    factory: nativeCompile.createNativeCompileDefaultsTransport,
    stub: compileStub,
    native: nativeCompile,
    stubCall: () => compileStub.createNativeCompileDefaultsTransport(),
  },
  {
    name: "export",
    endpoint: "/api/project/export-defaults",
    label: "export-defaults.setExportDefaults",
    set: setExportDefaults,
    http: httpExportDefaultsTransport,
    coreFn: "setExportDefaultsCore",
    factory: nativeExport.createNativeExportDefaultsTransport,
    stub: exportStub,
    native: nativeExport,
    stubCall: () => exportStub.createNativeExportDefaultsTransport(),
  },
] as const;

describe.each(CASES)("set $name defaults - HTTP", (c) => {
  it("PUTs projectId and excludedResourceIds and returns the stored ids", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => ({ excludedResourceIds: [ID] }),
      } as Response);
    await expect(c.set("p", [ID])).resolves.toEqual({
      excludedResourceIds: [ID],
    });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(c.endpoint);
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual({
      projectId: "p",
      excludedResourceIds: [ID],
    });
  });

  it("clears (null) and accepts an empty object response", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
    await expect(c.set("p", null)).resolves.toEqual({
      excludedResourceIds: undefined,
    });
    expect(JSON.parse(String(fetchSpy.mock.calls[0][1]?.body))).toEqual({
      projectId: "p",
      excludedResourceIds: null,
    });
  });

  it("rejects with the server's message on a non-2xx response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "refused text" }),
    } as Response);
    await expect(c.set("p", [ID])).rejects.toThrow("refused text");
  });

  it("rejects with a status fallback when the error body is unreadable", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);
    await expect(c.set("p", [ID])).rejects.toThrow(/HTTP 500/);
  });

  it("rejects on a network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    await expect(c.set("p", [ID])).rejects.toThrow("offline");
  });

  it("reports a malformed body without passing the body, and rejects", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ excludedResourceIds: "SECRET-BODY-VALUE" }),
    } as Response);
    await expect(c.set("p", [ID])).rejects.toThrow();
    expect(reportTransportValidationFailure).toHaveBeenCalledTimes(1);
    const args = vi.mocked(reportTransportValidationFailure).mock.calls[0];
    expect(args[0]).toBe(c.label);
    expect(args).toHaveLength(2);
    expect(JSON.stringify(args)).not.toContain("SECRET-BODY-VALUE");
  });

  it("exposes the http transport object", () => {
    expect(typeof c.http.setDefaults).toBe("function");
  });
});

describe.each(CASES)("$name defaults native backend", (c) => {
  const transport = () =>
    c.factory({
      fs: createFakeCapacitorFilesystem(),
      projectsDir: "/projects",
    });

  it("calls the core directly, passing null (clear) through", async () => {
    const spy = vi
      .spyOn(core, c.coreFn)
      .mockResolvedValue({ excludedResourceIds: undefined });
    await expect(transport().setDefaults("proj-1", null)).resolves.toEqual({
      excludedResourceIds: undefined,
    });
    expect(spy).toHaveBeenCalledWith("proj-1", null);
  });

  it("propagates a refusal from the core with its message", async () => {
    vi.spyOn(core, c.coreFn).mockRejectedValue(
      new core.InvalidSavedDefaultsError(core.SAVED_DEFAULTS_MESSAGES.notUuid),
    );
    await expect(transport().setDefaults("proj-1", ["x"])).rejects.toThrow(
      core.SAVED_DEFAULTS_MESSAGES.notUuid,
    );
  });
});

describe.each(CASES)("$name defaults web-stub", (c) => {
  it("exports the same names as the native backend", () => {
    expect(Object.keys(c.stub).sort()).toEqual(Object.keys(c.native).sort());
  });

  it("throws if ever reached", () => {
    expect(() => c.stubCall()).toThrow(/web-stub/);
  });
});
