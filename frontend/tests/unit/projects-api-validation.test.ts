/**
 * Regression coverage for the FU-10 production incident (see
 * `specs/features/trash-ui/follow-up-work.md`): an unvalidated `openProject`
 * response dispatched `undefined` fields into the Redux store, crashing
 * `TrashView` immediately after a successful restore.
 *
 * This suite verifies `httpProjectsTransport`'s `list`, `open`, and `create`
 * (`src/lib/api/projects.ts`) reject a malformed-but-2xx response rather than
 * resolving with a value that would silently reach the Redux store, and that
 * a well-formed response still resolves normally. `reportTransportValidationFailure`
 * (`src/lib/api/transport-validation.ts`) is mocked so we can assert it is
 * called with the right call-site id without depending on console output.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/api/transport-validation", () => ({
  reportTransportValidationFailure: vi.fn(),
}));

import {
  listProjects,
  openProject,
  createProject,
} from "../../src/lib/api/projects";
import { reportTransportValidationFailure } from "../../src/lib/api/transport-validation";

const mockedReport = vi.mocked(reportTransportValidationFailure);

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

const validProject = {
  id: "aaaaaaaa-1111-4111-8111-111111111111",
  name: "Test Project",
  createdAt: "2024-01-01T00:00:00.000Z",
  config: { editorConfig: {} },
};

describe("projects.ts transport-boundary validation (FU-10 regression)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mockedReport.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("openProject (FU-10: the incident's exact call site)", () => {
    it("REJECTS rather than resolving when the response is missing folders/resources on an otherwise-2xx response", async () => {
      // This is the FU-10 shape: a 2xx response whose body has no
      // `folders`/`resources` at all. Before the fix, this reached
      // `TrashView`'s post-restore refetch as `undefined` fields and crashed
      // downstream Redux selectors.
      fetchMock.mockResolvedValue(jsonResponse({}));

      await expect(openProject("some-project-id")).rejects.toThrow();
      expect(mockedReport).toHaveBeenCalledWith(
        "projects.open",
        expect.any(Array),
      );
    });

    it("REJECTS when project is present but missing required fields", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ project: {}, folders: [], resources: [] }),
      );

      await expect(openProject("some-project-id")).rejects.toThrow();
      expect(mockedReport).toHaveBeenCalledWith(
        "projects.open",
        expect.any(Array),
      );
    });

    it("resolves normally with a well-formed response", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ project: validProject, folders: [], resources: [] }),
      );

      const result = await openProject(validProject.id);
      expect(result.project.id).toBe(validProject.id);
      expect(mockedReport).not.toHaveBeenCalled();
    });

    it("still throws the existing apiError on a non-ok HTTP response, without invoking validation", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: "not found" }, false));

      await expect(openProject("missing-id")).rejects.toThrow("not found");
      expect(mockedReport).not.toHaveBeenCalled();
    });
  });

  describe("listProjects", () => {
    it("REJECTS a malformed array entry instead of resolving", async () => {
      fetchMock.mockResolvedValue(jsonResponse([{ project: {} }]));

      await expect(listProjects()).rejects.toThrow();
      expect(mockedReport).toHaveBeenCalledWith(
        "projects.list",
        expect.any(Array),
      );
    });

    it("REJECTS a non-array body", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ not: "an array" }));

      await expect(listProjects()).rejects.toThrow();
      expect(mockedReport).toHaveBeenCalledWith(
        "projects.list",
        expect.any(Array),
      );
    });

    it("resolves normally with a well-formed list", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse([{ project: validProject, folders: [], resources: [] }]),
      );

      const result = await listProjects();
      expect(result).toHaveLength(1);
      expect(mockedReport).not.toHaveBeenCalled();
    });

    // FR20: `listProjectsCore` (`lib/models/project-crud-core.ts`) returns a
    // reduced entry for an encrypted project whose workspace is locked — only
    // `project.id`/`project.createdAt`, no `name`, and empty
    // resources/folders, plus `isLocked`/`isEncrypted: true`. Before this
    // schema modeled that shape as a real variant, this entry failed
    // `ProjectApiEntrySchema` (missing required `name`) and rejected the
    // *entire* list — the one locked project made every other project
    // disappear from the Start screen.
    it("resolves a locked-encrypted entry (no name, empty resources/folders) rather than rejecting the whole list", async () => {
      const lockedEntry = {
        project: {
          id: "bbbbbbbb-2222-4222-8222-222222222222",
          createdAt: "2026-08-03T23:27:04.118Z",
        },
        resources: [],
        folders: [],
        isLocked: true,
        isEncrypted: true,
      };
      fetchMock.mockResolvedValue(
        jsonResponse([
          { project: validProject, folders: [], resources: [] },
          lockedEntry,
        ]),
      );

      const result = await listProjects();

      expect(mockedReport).not.toHaveBeenCalled();
      expect(result).toHaveLength(2);
      const locked = result[1];
      expect(locked.isLocked).toBe(true);
      expect(locked.isEncrypted).toBe(true);
      expect(locked.project).toEqual(lockedEntry.project);
      expect(locked.resources).toEqual([]);
      expect(locked.folders).toEqual([]);
      // Never present on the locked variant.
      expect((locked.project as { name?: unknown }).name).toBeUndefined();
    });

    it("still REJECTS a genuinely malformed locked-shaped entry (isLocked true but missing project.id)", async () => {
      const malformedLockedEntry = {
        project: { createdAt: "2026-08-03T23:27:04.118Z" },
        resources: [],
        folders: [],
        isLocked: true,
        isEncrypted: true,
      };
      fetchMock.mockResolvedValue(jsonResponse([malformedLockedEntry]));

      await expect(listProjects()).rejects.toThrow();
      expect(mockedReport).toHaveBeenCalledWith(
        "projects.list",
        expect.any(Array),
      );
    });
  });

  describe("createProject", () => {
    it("REJECTS a malformed response instead of resolving", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ project: { name: "" } }));

      await expect(createProject("New Project")).rejects.toThrow();
      expect(mockedReport).toHaveBeenCalledWith(
        "projects.create",
        expect.any(Array),
      );
    });

    it("resolves normally with a well-formed response", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ project: validProject, folders: [], resources: [] }),
      );

      const result = await createProject("New Project");
      expect(result.project.id).toBe(validProject.id);
      expect(mockedReport).not.toHaveBeenCalled();
    });
  });
});
