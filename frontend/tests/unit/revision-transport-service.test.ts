/**
 * Regression coverage for the T9b fix: `revision-transport-service.ts` must
 * send the tenant-scoped `projectId` (the active project's on-disk directory
 * basename) to the revision routes migrated in Tasks 6-7, never the legacy
 * `projectPath`/`projectRoot` fields those routes now reject.
 *
 * The fixture below is the same FR12 basename-vs-id shape used in
 * `projects-slice-features.test.ts`: the directory basename (`rootPath`'s
 * trailing segment) and `project.json`'s internal `id` are two independently
 * generated UUIDs that must never be conflated.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createRevision,
  fetchRevisionContent,
  fetchRevisionList,
  persistCanonicalRevision,
  removeRevision,
  resolveRevisionRequestContext,
} from "../../src/store/revision-transport-service";
import type { RootState } from "../../src/store/store";

const directoryUuid = "aaaaaaaa-1111-4111-8111-111111111111";
const internalProjectJsonId = "bbbbbbbb-2222-4222-8222-222222222222";
const resourceId = "resource-1";

function createRootState(): RootState {
  return {
    projects: {
      selectedProjectId: internalProjectJsonId,
      projects: {
        [internalProjectJsonId]: {
          id: internalProjectJsonId,
          name: "Mismatched Project",
          rootPath: `/tmp/projects/${directoryUuid}`,
          folders: [],
          resources: [],
        },
      },
    },
    resources: { selectedResourceId: resourceId, resources: [], folders: [] },
  } as unknown as RootState;
}

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

describe("revision-transport-service (T9b regression)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolveRevisionRequestContext returns the directory basename as projectId, not project.id", () => {
    const state = createRootState();
    const context = resolveRevisionRequestContext(state, resourceId);

    if ("error" in context) {
      throw new Error(
        `Expected a resolved context, got error: ${context.error}`,
      );
    }

    expect(context.projectId).toBe(directoryUuid);
    expect(context.projectId).not.toBe(internalProjectJsonId);
    expect(context.resourceId).toBe(resourceId);
  });

  it("fetchRevisionList sends projectId in the POST body, with no projectPath/projectRoot field", async () => {
    await fetchRevisionList({ projectId: directoryUuid, resourceId });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/project-resources");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.projectId).toBe(directoryUuid);
    expect(body).not.toHaveProperty("projectPath");
    expect(body).not.toHaveProperty("projectRoot");
  });

  it("createRevision sends projectId in the POST body, with no projectPath/projectRoot field", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "revision-1" }));

    await createRevision(
      { projectId: directoryUuid, resourceId },
      "My revision",
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/resource/revision/${resourceId}`);
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.projectId).toBe(directoryUuid);
    expect(body).not.toHaveProperty("projectPath");
    expect(body).not.toHaveProperty("projectRoot");
  });

  it("removeRevision sends projectId in the DELETE body, with no projectPath/projectRoot field", async () => {
    await removeRevision(
      { projectId: directoryUuid, resourceId },
      "revision-1",
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/resource/revision/${resourceId}`);
    expect((init as RequestInit).method).toBe("DELETE");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.projectId).toBe(directoryUuid);
    expect(body).not.toHaveProperty("projectPath");
    expect(body).not.toHaveProperty("projectRoot");
  });

  it("fetchRevisionContent sends projectId as a query param, with no projectPath/projectRoot param", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ revision: {}, content: "preview" }),
    );

    await fetchRevisionContent(
      { projectId: directoryUuid, resourceId },
      "revision-1",
    );

    const [url] = fetchMock.mock.calls[0];
    const parsed = new URL(url as string, "http://localhost");
    expect(parsed.pathname).toBe(`/api/resource/revision/${resourceId}`);
    expect(parsed.searchParams.get("projectId")).toBe(directoryUuid);
    expect(parsed.searchParams.has("projectPath")).toBe(false);
    expect(parsed.searchParams.has("projectRoot")).toBe(false);
  });

  it("persistCanonicalRevision sends projectId in the PATCH body, with no projectPath/projectRoot field", async () => {
    await persistCanonicalRevision(
      { projectId: directoryUuid, resourceId },
      "revision-1",
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/resource/revision/${resourceId}`);
    expect((init as RequestInit).method).toBe("PATCH");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.projectId).toBe(directoryUuid);
    expect(body).not.toHaveProperty("projectPath");
    expect(body).not.toHaveProperty("projectRoot");
  });
});
