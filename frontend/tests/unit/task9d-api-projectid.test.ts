/**
 * Regression coverage for Task 9d: the client transport functions in
 * `src/lib/api/tags.ts`, `editor-config.ts`, `preferences.ts`, `export.ts`,
 * `resource-excerpts.ts`, and `projects.ts` (`openProject`) must send the
 * tenant-scoped `projectId` (the active project's on-disk directory
 * basename) to their routes, never the legacy `projectPath`/`projectRoot`
 * fields those hard-cutover routes now reject.
 *
 * Mirrors the pattern in `resources-api.test.ts` (Task 9c): mock
 * `global.fetch`, call each function, assert the outgoing body/query has
 * `projectId` and not `projectPath`/`projectRoot`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  listTags,
  listTagAssignments,
  createTag,
  deleteTag,
  assignTag,
} from "../../src/lib/api/tags";
import {
  saveHeadingSettings,
  saveBodySettings,
} from "../../src/lib/api/editor-config";
import {
  saveProjectPreferences,
  saveRevisionSettings,
} from "../../src/lib/api/preferences";
import { exportText, exportMarkdown } from "../../src/lib/api/export";
import { fetchResourceExcerpts } from "../../src/lib/api/resource-excerpts";
import { openProject } from "../../src/lib/api/projects";

const directoryUuid = "aaaaaaaa-1111-4111-8111-111111111111";

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

function bodyOf(init: RequestInit | undefined): Record<string, unknown> {
  return JSON.parse((init as RequestInit).body as string);
}

describe("Task 9d: projectId-based client transports", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("tags.ts", () => {
    it("listTags sends projectId, not projectPath", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ tags: [] }));
      await listTags(directoryUuid);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/project/tags");
      const body = bodyOf(init);
      expect(body.projectId).toBe(directoryUuid);
      expect(body).not.toHaveProperty("projectPath");
      expect(body).not.toHaveProperty("projectRoot");
    });

    it("listTagAssignments sends projectId, not projectPath", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ tagIds: [] }));
      await listTagAssignments(directoryUuid, "resource-1");
      const [, init] = fetchMock.mock.calls[0];
      const body = bodyOf(init);
      expect(body.projectId).toBe(directoryUuid);
      expect(body).not.toHaveProperty("projectPath");
    });

    it("createTag sends projectId, not projectPath", async () => {
      await createTag(directoryUuid, "Draft", "#d44040");
      const [, init] = fetchMock.mock.calls[0];
      const body = bodyOf(init);
      expect(body.projectId).toBe(directoryUuid);
      expect(body).not.toHaveProperty("projectPath");
    });

    it("deleteTag sends projectId, not projectPath", async () => {
      await deleteTag(directoryUuid, "tag-1");
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/project/tags/delete");
      const body = bodyOf(init);
      expect(body.projectId).toBe(directoryUuid);
      expect(body).not.toHaveProperty("projectPath");
    });

    it("assignTag sends projectId, not projectPath", async () => {
      await assignTag(directoryUuid, "resource-1", "tag-1", true);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/project/tags/assign");
      const body = bodyOf(init);
      expect(body.projectId).toBe(directoryUuid);
      expect(body).not.toHaveProperty("projectPath");
    });
  });

  describe("editor-config.ts", () => {
    it("saveHeadingSettings sends projectId, not projectPath", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ editorConfig: {} }));
      await saveHeadingSettings(directoryUuid, {});
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/project/editor-config");
      const body = bodyOf(init);
      expect(body.projectId).toBe(directoryUuid);
      expect(body).not.toHaveProperty("projectPath");
    });

    it("saveBodySettings sends projectId, not projectPath", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ editorConfig: {} }));
      await saveBodySettings(directoryUuid, {} as never);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/project/editor-config");
      const body = bodyOf(init);
      expect(body.projectId).toBe(directoryUuid);
      expect(body).not.toHaveProperty("projectPath");
    });
  });

  describe("preferences.ts", () => {
    it("saveProjectPreferences sends projectId, not projectPath", async () => {
      await saveProjectPreferences(directoryUuid, { colorMode: "dark" });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/project/preferences");
      const body = bodyOf(init);
      expect(body.projectId).toBe(directoryUuid);
      expect(body).not.toHaveProperty("projectPath");
    });

    it("saveRevisionSettings sends projectId, not projectPath", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ defaultRevisionName: "v" }));
      await saveRevisionSettings(directoryUuid, "Draft %n");
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/project/revision-settings");
      const body = bodyOf(init);
      expect(body.projectId).toBe(directoryUuid);
      expect(body).not.toHaveProperty("projectPath");
    });
  });

  describe("export.ts", () => {
    it("exportText sends projectId, not projectPath", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ text: "hi", filename: "out.txt" }),
      );
      await exportText({
        projectId: directoryUuid,
        resourceIds: ["r1"],
        resources: [{ id: "r1", name: "Doc", type: "text" }],
        exportName: "Doc",
      });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/export/text");
      const body = bodyOf(init);
      expect(body.projectId).toBe(directoryUuid);
      expect(body).not.toHaveProperty("projectPath");
    });

    it("exportMarkdown sends projectId, not projectPath", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ markdown: "# hi", filename: "out.md", warnings: [] }),
      );
      await exportMarkdown({
        projectId: directoryUuid,
        resourceIds: ["r1"],
        resources: [{ id: "r1", name: "Doc", type: "text" }],
        exportName: "Doc",
      });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/export/markdown");
      const body = bodyOf(init);
      expect(body.projectId).toBe(directoryUuid);
      expect(body).not.toHaveProperty("projectPath");
    });
  });

  describe("resource-excerpts.ts", () => {
    it("fetchResourceExcerpts sends projectId, not projectPath", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ excerpts: {} }));
      await fetchResourceExcerpts(directoryUuid, ["r1"], 100);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/project-resources/excerpts");
      const body = bodyOf(init);
      expect(body.projectId).toBe(directoryUuid);
      expect(body).not.toHaveProperty("projectPath");
    });
  });

  describe("projects.ts", () => {
    it("openProject sends projectId, not projectPath", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ project: {}, folders: [], resources: [] }),
      );
      await openProject(directoryUuid);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/project");
      const body = bodyOf(init);
      expect(body.projectId).toBe(directoryUuid);
      expect(body).not.toHaveProperty("projectPath");
    });
  });
});
