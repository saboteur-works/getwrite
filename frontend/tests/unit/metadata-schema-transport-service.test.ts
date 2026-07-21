/**
 * Regression coverage for the T9e fix: `metadata-schema-transport-service.ts`
 * must send the tenant-scoped `projectId` (the project's on-disk directory
 * basename) to `/api/project/metadata-schema`, never the legacy
 * `projectPath` field that route now rejects.
 *
 * Prior to this fix, `MetadataSchemaRequestContext` carried a `projectId`
 * field that was *already* present but wrongly sourced (it simply echoed
 * back the Redux `projects.projects` map key passed into
 * `resolveMetadataSchemaRequestContext`, i.e. `project.json`'s internal
 * `id`, not the on-disk directory basename) — and every function sent
 * `context.projectPath` (the correctly-sourced value) under the wrong field
 * name. The fixture below is the same FR12 basename-vs-id shape used in
 * `revision-transport-service.test.ts`: the directory basename (`rootPath`'s
 * trailing segment) and `project.json`'s internal `id` are two independently
 * generated UUIDs that must never be conflated.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchFieldValues,
  postAddField,
  postAddGroup,
  resolveMetadataSchemaRequestContext,
} from "../../src/store/metadata-schema-transport-service";
import type { MetadataField, MetadataGroup } from "../../src/lib/models/types";

const directoryUuid = "aaaaaaaa-6666-4666-8666-666666666666";
const internalProjectJsonId = "bbbbbbbb-7777-4777-8777-777777777777";

function createState(): unknown {
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
  };
}

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

describe("metadata-schema-transport-service (T9e regression)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({ schema: {} }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolveMetadataSchemaRequestContext returns the directory basename as projectId, not the lookup key/project.id", () => {
    const state = createState();
    const context = resolveMetadataSchemaRequestContext(
      state,
      internalProjectJsonId,
    );

    if ("error" in context) {
      throw new Error(
        `Expected a resolved context, got error: ${context.error}`,
      );
    }

    expect(context.projectId).toBe(directoryUuid);
    expect(context.projectId).not.toBe(internalProjectJsonId);
    expect(context).not.toHaveProperty("projectPath");
  });

  it("postAddField sends projectId in the POST body, with no projectPath field", async () => {
    const field: MetadataField = {
      key: "status",
      label: "Status",
      type: "text",
    };

    await postAddField({ projectId: directoryUuid }, "group-1", field);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/project/metadata-schema");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.action).toBe("add-field");
    expect(body.projectId).toBe(directoryUuid);
    expect(body).not.toHaveProperty("projectPath");
  });

  it("postAddGroup sends projectId in the POST body, with no projectPath field", async () => {
    const group: MetadataGroup = { id: "group-1", label: "Group", fields: [] };
    await postAddGroup({ projectId: directoryUuid }, group);

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.action).toBe("add-group");
    expect(body.projectId).toBe(directoryUuid);
    expect(body).not.toHaveProperty("projectPath");
  });

  it("fetchFieldValues sends projectId as a query param, with no projectPath param", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ values: [] }));

    await fetchFieldValues(directoryUuid, "status");

    const [url] = fetchMock.mock.calls[0];
    const parsed = new URL(url as string, "http://localhost");
    expect(parsed.pathname).toBe("/api/project/metadata-schema");
    expect(parsed.searchParams.get("projectId")).toBe(directoryUuid);
    expect(parsed.searchParams.has("projectPath")).toBe(false);
  });
});
