/**
 * Regression coverage for Task 9c: `src/lib/api/resources.ts`'s CRUD
 * functions (`createResource`, `uploadMediaResource`, `copyResource`,
 * `deleteResource`, `updateSidecar`, `renameResource`) must send the
 * tenant-scoped `projectId` (the active project's on-disk directory
 * basename) to their routes, never the legacy `projectPath`/`projectRoot`
 * fields those hard-cutover routes now reject.
 *
 * The fixture value below is the same FR12 basename-vs-id shape used in
 * `revision-transport-service.test.ts`: the directory basename (`rootPath`'s
 * trailing segment) and `project.json`'s internal `id` are two independently
 * generated UUIDs that must never be conflated. Here we simply assert the
 * value each function is given is the one sent on the wire — callers are
 * responsible for sourcing that value via `selectActiveProjectDirectoryId`
 * / `getProjectDirectoryId` (covered by the UI-caller assertions below).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/api/transport-validation", () => ({
  reportTransportValidationFailure: vi.fn(),
}));

import {
  copyResource,
  createResource,
  deleteResource,
  httpResourcesTransport,
  renameResource,
  updateSidecar,
  uploadMediaResource,
} from "../../src/lib/api/resources";
import { reportTransportValidationFailure } from "../../src/lib/api/transport-validation";
import type { AnyResource } from "../../src/lib/models/types";

const mockedReport = vi.mocked(reportTransportValidationFailure);

const directoryUuid = "aaaaaaaa-1111-4111-8111-111111111111";
const resourceId = "resource-1";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

/**
 * A minimal, schema-valid `AnyResource` (text subtype) fixture — satisfies
 * `ResourceResponseSchema` (`src/lib/api/schemas.ts`) so tests that don't
 * exercise validation failure aren't tripped up by it.
 */
const validResource = {
  id: "bbbbbbbb-2222-4222-8222-222222222222",
  slug: "untitled",
  name: "Untitled",
  type: "text",
  createdAt: "2024-01-01T00:00:00.000Z",
};

describe("resources.ts CRUD functions (T9c regression)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ resource: validResource }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("createResource sends projectId in the POST body, with no projectPath field", async () => {
    await createResource(directoryUuid, { type: "text", name: "Untitled" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/resource");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.projectId).toBe(directoryUuid);
    expect(body).not.toHaveProperty("projectPath");
    expect(body).not.toHaveProperty("projectRoot");
  });

  it("uploadMediaResource sends a projectId form field, with no projectPath field", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ resource: validResource }));
    const file = new File(["x"], "photo.png", { type: "image/png" });

    await uploadMediaResource(directoryUuid, file);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/resource/upload");
    const form = (init as RequestInit).body as FormData;
    expect(form.get("projectId")).toBe(directoryUuid);
    expect(form.has("projectPath")).toBe(false);
    expect(form.has("projectRoot")).toBe(false);
  });

  it("createResource rejects when the response body doesn't match ResourceResponseSchema", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ resource: { id: "not-a-uuid" } }),
    );

    await expect(
      createResource(directoryUuid, { type: "text", name: "Untitled" }),
    ).rejects.toThrow();
  });

  it("uploadMediaResource rejects when the response body doesn't match ResourceResponseSchema", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ resource: { id: "not-a-uuid" } }),
    );
    const file = new File(["x"], "photo.png", { type: "image/png" });

    await expect(uploadMediaResource(directoryUuid, file)).rejects.toThrow();
  });

  it("copyResource rejects when the response body doesn't match ResourceResponseSchema", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ resource: { id: "not-a-uuid" } }),
    );

    await expect(
      copyResource(resourceId, "Copy of thing", directoryUuid),
    ).rejects.toThrow();
  });

  it("copyResource sends projectId in the POST body, with no projectRoot field", async () => {
    await copyResource(resourceId, "Copy of thing", directoryUuid);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/resource/${resourceId}`);
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.action).toBe("copy");
    expect(body.projectId).toBe(directoryUuid);
    expect(body).not.toHaveProperty("projectPath");
    expect(body).not.toHaveProperty("projectRoot");
  });

  it("deleteResource sends projectId in the POST body, with no projectRoot field", async () => {
    await deleteResource(resourceId, directoryUuid);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/resource/${resourceId}`);
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.action).toBe("delete");
    expect(body.projectId).toBe(directoryUuid);
    expect(body).not.toHaveProperty("projectPath");
    expect(body).not.toHaveProperty("projectRoot");
  });

  it("deleteResource rejects when fetch resolves with a non-2xx response (Trash UI follow-ups, Task 4)", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, false, 500));

    await expect(deleteResource(resourceId, directoryUuid)).rejects.toThrow();
  });

  it("updateSidecar sends projectId in the POST body, with no projectRoot field", async () => {
    const updated = {
      id: resourceId,
      name: "Renamed",
    } as unknown as AnyResource;

    await updateSidecar(resourceId, directoryUuid, updated);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/resource/${resourceId}/sidecar`);
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.projectId).toBe(directoryUuid);
    expect(body).not.toHaveProperty("projectPath");
    expect(body).not.toHaveProperty("projectRoot");
  });

  it("updateSidecar sends clearKeys in the POST body when provided, and omits it when not", async () => {
    const updated = {
      id: resourceId,
      name: "Renamed",
    } as unknown as AnyResource;

    await updateSidecar(resourceId, directoryUuid, updated, [
      "entityKind",
      "aliases",
    ]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/resource/${resourceId}/sidecar`);
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.clearKeys).toEqual(["entityKind", "aliases"]);

    fetchMock.mockClear();
    await updateSidecar(resourceId, directoryUuid, updated);

    const [, initWithoutClearKeys] = fetchMock.mock.calls[0];
    const bodyWithoutClearKeys = JSON.parse(
      (initWithoutClearKeys as RequestInit).body as string,
    );
    expect(bodyWithoutClearKeys).not.toHaveProperty("clearKeys");
  });

  it("renameResource sends projectId in the POST body, with no projectRoot field", async () => {
    await renameResource(resourceId, directoryUuid, "New name", "resource");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/resource/${resourceId}/rename`);
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.projectId).toBe(directoryUuid);
    expect(body).not.toHaveProperty("projectPath");
    expect(body).not.toHaveProperty("projectRoot");
  });
});

/**
 * Task 2 (Feature 50): `httpResourcesTransport.fetchContent` and
 * `.fetchRevisionContent` validate their response body against
 * `ResourceContentResponseSchema`/`ResourceRevisionContentResponseSchema`
 * before returning it, reporting through the mocked
 * `reportTransportValidationFailure` (never logging the raw body — these
 * bodies can carry server-decrypted user prose on an encrypted project) and
 * falling back to their pre-existing `null` result on failure, exactly as on
 * a non-ok HTTP response.
 */
describe("resources.ts transport-boundary validation (Feature 50, Task 2)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mockedReport.mockClear();
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe("fetchContent", () => {
    it("returns null and reports validation failure with a Zod issues array when the body fails ResourceContentResponseSchema", async () => {
      const rawSecretProse = "server-decrypted prose that must never leak";
      fetchMock.mockResolvedValue(
        jsonResponse({ resourceContent: { tipTapContent: rawSecretProse } }),
      );

      const result = await httpResourcesTransport.fetchContent(
        directoryUuid,
        resourceId,
      );

      expect(result).toBeNull();
      expect(mockedReport).toHaveBeenCalledTimes(1);
      const [callSite, issues] = mockedReport.mock.calls[0];
      expect(callSite).toBe("resources.fetchContent");
      expect(Array.isArray(issues)).toBe(true);

      // Hard security requirement: the raw body must never reach the
      // reporter (only Zod issues) or any console output.
      expect(JSON.stringify(issues)).not.toContain(rawSecretProse);
      expect(consoleWarnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining(rawSecretProse),
      );
      expect(consoleErrorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining(rawSecretProse),
      );
    });

    it("resolves normally with a well-formed body", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          resourceContent: {
            tipTapContent: { type: "doc", content: [] },
            plaintextContent: "hello",
          },
          revisions: [{ id: "rev-1", isCanonical: true }],
        }),
      );

      const result = await httpResourcesTransport.fetchContent(
        directoryUuid,
        resourceId,
      );

      expect(result).toEqual({
        resourceContent: {
          tipTapContent: { type: "doc", content: [] },
          plaintextContent: "hello",
        },
        revisions: [{ id: "rev-1", isCanonical: true }],
      });
      expect(mockedReport).not.toHaveBeenCalled();
    });
  });

  describe("fetchRevisionContent", () => {
    // `ResourceRevisionContentResponseSchema`'s `content` field is
    // deliberately `z.unknown().optional()` (see `schemas.ts`'s doc
    // comment) — a wrongly-typed `content` value (e.g. a number) is
    // intentionally accepted by the schema itself and instead falls through
    // to the existing `typeof result.data.content === "string"` narrowing,
    // which already returns `null` for it without ever calling the
    // reporter — unchanged pre-existing behavior. To exercise an actual
    // schema *rejection*, the response envelope itself must not be a plain
    // object at all.
    it("returns null and reports validation failure with a Zod issues array when the response body isn't an object the schema accepts", async () => {
      fetchMock.mockResolvedValue(jsonResponse(["not", "an", "object"]));

      const result = await httpResourcesTransport.fetchRevisionContent(
        resourceId,
        directoryUuid,
        "rev-1",
      );

      expect(result).toBeNull();
      expect(mockedReport).toHaveBeenCalledTimes(1);
      const [callSite, issues] = mockedReport.mock.calls[0];
      expect(callSite).toBe("resources.fetchRevisionContent");
      expect(Array.isArray(issues)).toBe(true);
      expect(JSON.stringify(issues)).not.toContain("not an object");
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it("returns null (matching the pre-existing typeof-narrowing fallback, without reporting) when content is a well-formed-per-schema but non-string value", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ content: 12345 }));

      const result = await httpResourcesTransport.fetchRevisionContent(
        resourceId,
        directoryUuid,
        "rev-1",
      );

      expect(result).toBeNull();
      expect(mockedReport).not.toHaveBeenCalled();
    });

    it("resolves normally with a well-formed string content body", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ content: "revision text" }));

      const result = await httpResourcesTransport.fetchRevisionContent(
        resourceId,
        directoryUuid,
        "rev-1",
      );

      expect(result).toBe("revision text");
      expect(mockedReport).not.toHaveBeenCalled();
    });
  });
});
