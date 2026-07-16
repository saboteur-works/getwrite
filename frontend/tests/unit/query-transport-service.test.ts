/**
 * Regression coverage for the T9e fix: `query-transport-service.ts` must
 * send the tenant-scoped `projectId` (the active project's on-disk directory
 * basename) to the query routes, never the legacy `projectPath` field those
 * routes now reject.
 *
 * Prior to this fix, `QueryRequestContext` carried a `projectId` field that
 * was *already* present but wrongly sourced (it echoed
 * `state.projects.selectedProjectId`, i.e. `project.json`'s internal `id`,
 * not the on-disk directory basename) — and every function sent
 * `context.projectPath` (the correctly-sourced value) under the wrong field
 * name. The fixture below is the same FR12 basename-vs-id shape used in
 * `revision-transport-service.test.ts`: the directory basename (`rootPath`'s
 * trailing segment) and `project.json`'s internal `id` are two independently
 * generated UUIDs that must never be conflated.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  evaluateQueryAst,
  fetchSavedQueryList,
  persistSavedQuery,
  removeSavedQuery,
  resolveQueryRequestContext,
} from "../../src/store/query-transport-service";
import type { RootState } from "../../src/store/store";
import type { SavedQuery } from "../../src/lib/models/saved-queries";
import type { QueryAST } from "../../src/lib/models/query-ast";

const directoryUuid = "aaaaaaaa-4444-4444-8444-444444444444";
const internalProjectJsonId = "bbbbbbbb-5555-4555-8555-555555555555";

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
  } as unknown as RootState;
}

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

describe("query-transport-service (T9e regression)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolveQueryRequestContext returns the directory basename as projectId, not project.id/selectedProjectId", () => {
    const state = createRootState();
    const context = resolveQueryRequestContext(state, internalProjectJsonId);

    if ("error" in context) {
      throw new Error(
        `Expected a resolved context, got error: ${context.error}`,
      );
    }

    expect(context.projectId).toBe(directoryUuid);
    expect(context.projectId).not.toBe(internalProjectJsonId);
    expect(context).not.toHaveProperty("projectPath");
  });

  it("fetchSavedQueryList sends projectId in the POST body, with no projectPath field", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ queries: [] }));

    await fetchSavedQueryList({ projectId: directoryUuid });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/project/query/saved");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.action).toBe("list");
    expect(body.projectId).toBe(directoryUuid);
    expect(body).not.toHaveProperty("projectPath");
  });

  it("persistSavedQuery sends projectId in the POST body, with no projectPath field", async () => {
    const query = { id: "q1", name: "Q" } as unknown as SavedQuery;
    fetchMock.mockResolvedValue(jsonResponse({ query }));

    await persistSavedQuery({ projectId: directoryUuid }, query);

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.action).toBe("write");
    expect(body.projectId).toBe(directoryUuid);
    expect(body).not.toHaveProperty("projectPath");
  });

  it("removeSavedQuery sends projectId in the POST body, with no projectPath field", async () => {
    await removeSavedQuery({ projectId: directoryUuid }, "q1");

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.action).toBe("delete");
    expect(body.projectId).toBe(directoryUuid);
    expect(body).not.toHaveProperty("projectPath");
  });

  it("evaluateQueryAst sends projectId in the POST body, with no projectPath field", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ids: [] }));

    const definition: QueryAST = { op: "exists", field: "status" };
    await evaluateQueryAst({ projectId: directoryUuid }, definition);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/project/query/evaluate");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.projectId).toBe(directoryUuid);
    expect(body).not.toHaveProperty("projectPath");
  });
});
