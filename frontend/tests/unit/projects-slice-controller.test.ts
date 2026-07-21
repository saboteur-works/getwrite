import { afterEach, describe, expect, it, vi } from "vitest";
import { updateProjectMetadataSchema } from "../../src/store/projectsSlice";

import { projectActionsController } from "../../src/store/project-actions-controller";

import { DEFAULT_METADATA_SCHEMA } from "../../src/lib/models/default-metadata-schema";
import projectsReducer, {
  addResource,
  deleteProject,
  normalizeStoredProject,
  renameProject,
  removeResource,
  selectActiveProjectMetadataSchema,
  selectProject,
  selectSelectedProjectId,
  setProject,
  setProjects,
  setSelectedProjectId,
  type ProjectsState,
  type StoredProject,
} from "../../src/store/projectsSlice";

function createProjectsState(
  overrides?: Partial<ProjectsState>,
): ProjectsState {
  return { selectedProjectId: null, projects: {}, ...overrides };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("store/projectsSlice controller guardrails (T008)", () => {
  it("normalizes legacy stored projects without dropping resource identity", () => {
    const normalized = normalizeStoredProject({
      id: "project-1",
      rootPath: "/tmp/project-1",
      resources: [{ id: "resource-1" }],
    } as StoredProject);

    expect(normalized.folders).toEqual([]);
    expect(normalized.resources).toEqual([
      { id: "resource-1", name: "", userMetadata: {} },
    ]);
  });

  it("memoizes normalized project selectors until the stored project reference changes", () => {
    const state = createProjectsState();
    const nextState = projectsReducer(
      state,
      setProjects([
        {
          project: {
            id: "project-1",
            name: "Project One",
            rootPath: "/tmp/project-1",
            createdAt: "2026-03-21T12:00:00.000Z",
          },
          folders: [{ id: "folder-1", name: "Workspace" }],
          resources: [{ id: "resource-1", name: "Scene One" }],
        },
      ]),
    );

    const rootState = { projects: nextState };
    const first = selectProject(rootState, "project-1");
    const second = selectProject(rootState, "project-1");

    expect(first).toEqual(
      expect.objectContaining({
        id: "project-1",
        name: "Project One",
        folders: [{ id: "folder-1", name: "Workspace" }],
        // setProjects maps resources through buildStoredProject, normalizing to
        // the same shape the create/open flows produce (folderId/userMetadata
        // defaulted) so both store-entry paths agree.
        resources: [
          {
            id: "resource-1",
            name: "Scene One",
            folderId: null,
            userMetadata: {},
          },
        ],
      }),
    );
    expect(second).toBe(first);
  });

  it("adds and removes project resources by stable resource id while preserving project selection", () => {
    const baseState = createProjectsState({
      selectedProjectId: "project-1",
      projects: {
        "project-1": {
          id: "project-1",
          name: "Project One",
          rootPath: "/tmp/project-1",
          folders: [],
          resources: [{ id: "resource-1", name: "Scene One" }],
        },
      },
    });

    const withSelection = projectsReducer(
      baseState,
      setSelectedProjectId("project-1"),
    );
    const withAddedResource = projectsReducer(
      withSelection,
      addResource({
        projectId: "project-1",
        resource: { id: "resource-2", name: "Scene Two" },
      }),
    );
    const withRemovedResource = projectsReducer(
      withAddedResource,
      removeResource({ projectId: "project-1", resourceId: "resource-1" }),
    );

    expect(selectSelectedProjectId({ projects: withRemovedResource })).toBe(
      "project-1",
    );
    expect(
      withRemovedResource.projects["project-1"].resources?.map(
        (resource) => resource.id,
      ),
    ).toEqual(["resource-2"]);
  });

  it("renames and deletes projects while preserving selected-project invariants", () => {
    const baseState = createProjectsState({
      selectedProjectId: "project-1",
      projects: {
        "project-1": {
          id: "project-1",
          name: "Project One",
          rootPath: "/tmp/project-1",
        },
      },
    });

    const renamedState = projectsReducer(
      baseState,
      renameProject({ projectId: "project-1", newName: "Project Renamed" }),
    );
    const deletedState = projectsReducer(
      renamedState,
      deleteProject({ projectId: "project-1" }),
    );

    expect(renamedState.projects["project-1"].name).toBe("Project Renamed");
    expect(deletedState.projects["project-1"]).toBeUndefined();
    expect(deletedState.selectedProjectId).toBeNull();
  });
});

describe("store/project-actions-controller guardrails (T017 / T9f)", () => {
  // FR12 fixture: `storeProjectId` mirrors `project.json`'s internal `id`
  // (used only for local UI callbacks) while `directoryProjectId` is the
  // on-disk directory basename the hard-cutover routes require. These are
  // two independently generated UUIDs and must never be conflated.
  const storeProjectId = "11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const directoryProjectId = "22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  it("calls rename endpoint with the directory-basename projectId (not the store id or a projectPath) and invokes callback with the store id", async () => {
    const onRename = vi.fn();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    await projectActionsController.renameProject({
      storeProjectId,
      projectId: directoryProjectId,
      newName: "Project Renamed",
      onRename,
    });

    expect(onRename).toHaveBeenCalledWith(storeProjectId, "Project Renamed");
    expect(fetchSpy).toHaveBeenCalledWith("/api/project/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: directoryProjectId,
        newName: "Project Renamed",
      }),
    });
    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string) as Record<
      string,
      unknown
    >;
    expect(body).not.toHaveProperty("projectPath");
    expect(body).not.toHaveProperty("projectRoot");
  });

  it("calls delete endpoint with the directory-basename projectId (not the store id or a projectPath) and invokes callback with the store id", async () => {
    const onDelete = vi.fn();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    await projectActionsController.deleteProject({
      storeProjectId,
      projectId: directoryProjectId,
      onDelete,
    });

    expect(onDelete).toHaveBeenCalledWith(storeProjectId);
    expect(fetchSpy).toHaveBeenCalledWith("/api/project/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: directoryProjectId }),
    });
    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string) as Record<
      string,
      unknown
    >;
    expect(body).not.toHaveProperty("projectPath");
    expect(body).not.toHaveProperty("projectRoot");
  });

  it("throws before invoking callback or fetch when the directory-basename projectId is missing", async () => {
    const onDelete = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      projectActionsController.deleteProject({
        storeProjectId,
        projectId: undefined,
        onDelete,
      }),
    ).rejects.toThrow(/Project ID is required/);

    expect(onDelete).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("store/projectsSlice — metadataSchema injection (Task 3)", () => {
  it("injects DEFAULT_METADATA_SCHEMA when project has no stored metadataSchema via setProjects", () => {
    const state = projectsReducer(
      undefined,
      setProjects([
        {
          project: {
            id: "project-1",
            name: "No Schema Project",
            rootPath: "/tmp/no-schema",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          folders: [],
          resources: [],
        },
      ]),
    );

    expect(state.projects["project-1"].metadataSchema).toEqual(
      DEFAULT_METADATA_SCHEMA,
    );
  });

  it("preserves the stored metadataSchema verbatim when project.json has one via setProjects", () => {
    const customSchema = {
      groups: [
        {
          id: "custom-group",
          label: "Custom",
          fields: [
            {
              key: "my-field",
              label: "My Field",
              type: "text" as const,
              locked: false,
            },
          ],
        },
      ],
    };

    const state = projectsReducer(
      undefined,
      setProjects([
        {
          project: {
            id: "project-2",
            name: "Has Schema Project",
            rootPath: "/tmp/has-schema",
            createdAt: "2026-01-01T00:00:00.000Z",
            config: { metadataSchema: customSchema, editorConfig: {} },
          },
          folders: [],
          resources: [],
        },
      ]),
    );

    expect(state.projects["project-2"].metadataSchema).toEqual(customSchema);
  });

  it("injects DEFAULT_METADATA_SCHEMA when setProject is dispatched without a metadataSchema", () => {
    const state = projectsReducer(
      undefined,
      setProject({
        id: "project-3",
        name: "Direct Set Project",
        rootPath: "/tmp/direct",
      }),
    );

    expect(state.projects["project-3"].metadataSchema).toEqual(
      DEFAULT_METADATA_SCHEMA,
    );
  });

  it("preserves existing metadataSchema when setProject is dispatched with one", () => {
    const customSchema = {
      groups: [
        {
          id: "my-group",
          label: "My Group",
          fields: [{ key: "title", label: "Title", type: "text" as const }],
        },
      ],
    };

    const state = projectsReducer(
      undefined,
      setProject({
        id: "project-4",
        name: "Preset Schema Project",
        rootPath: "/tmp/preset",
        metadataSchema: customSchema,
      }),
    );

    expect(state.projects["project-4"].metadataSchema).toEqual(customSchema);
  });

  it("selectActiveProjectMetadataSchema returns the active project schema", () => {
    let state = projectsReducer(
      undefined,
      setProjects([
        {
          project: {
            id: "project-1",
            name: "Project One",
            rootPath: "/tmp/project-1",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          folders: [],
          resources: [],
        },
      ]),
    );
    state = projectsReducer(state, setSelectedProjectId("project-1"));

    const rootState = { projects: state };
    expect(selectActiveProjectMetadataSchema(rootState)).toEqual(
      DEFAULT_METADATA_SCHEMA,
    );
  });

  it("selectActiveProjectMetadataSchema returns DEFAULT_METADATA_SCHEMA when no project is selected", () => {
    const state = projectsReducer(undefined, { type: "@@INIT" });
    const rootState = { projects: state };
    expect(selectActiveProjectMetadataSchema(rootState)).toEqual(
      DEFAULT_METADATA_SCHEMA,
    );
  });
});

describe("store/projectsSlice — updateProjectMetadataSchema guard (T008-P)", () => {
  it("no-ops when the target projectId does not exist in the store", () => {
    const state = projectsReducer(undefined, { type: "@@INIT" });
    const nextState = projectsReducer(
      state,
      updateProjectMetadataSchema({
        projectId: "nonexistent-project",
        schema: DEFAULT_METADATA_SCHEMA,
      }),
    );
    expect(nextState).toEqual(state);
  });

  it("replaces metadataSchema on an existing project without touching other fields", () => {
    const withProject = projectsReducer(
      undefined,
      setProject({ id: "project-1", rootPath: "/tmp/p1", name: "P1" }),
    );

    const newSchema = {
      groups: [
        {
          id: "g1",
          label: "Novel",
          fields: [
            { key: "pov", label: "POV", type: "text" as const, locked: false },
          ],
        },
      ],
    };

    const nextState = projectsReducer(
      withProject,
      updateProjectMetadataSchema({
        projectId: "project-1",
        schema: newSchema,
      }),
    );

    expect(nextState.projects["project-1"].metadataSchema).toEqual(newSchema);
    expect(nextState.projects["project-1"].name).toBe("P1");
    expect(nextState.projects["project-1"].rootPath).toBe("/tmp/p1");
  });
});
