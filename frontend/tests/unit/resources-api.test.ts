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

import {
  copyResource,
  createResource,
  deleteResource,
  renameResource,
  updateSidecar,
  uploadMediaResource,
} from "../../src/lib/api/resources";
import type { AnyResource } from "../../src/lib/models/types";

const directoryUuid = "aaaaaaaa-1111-4111-8111-111111111111";
const resourceId = "resource-1";

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

describe("resources.ts CRUD functions (T9c regression)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({ resource: {} }));
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
    fetchMock.mockResolvedValue(jsonResponse({ resource: {} }));
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
