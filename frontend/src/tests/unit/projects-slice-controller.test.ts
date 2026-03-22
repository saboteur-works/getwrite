import { afterEach, describe, expect, it, vi } from "vitest";

import { projectActionsController } from "../../store/project-actions-controller";

import projectsReducer, {
    addResource,
    deleteProject,
    normalizeStoredProject,
    renameProject,
    removeResource,
    selectProject,
    selectSelectedProjectId,
    setProjects,
    setSelectedProjectId,
    type ProjectsState,
    type StoredProject,
} from "../../store/projectsSlice";

function createProjectsState(
    overrides?: Partial<ProjectsState>,
): ProjectsState {
    return {
        selectedProjectId: null,
        projects: {},
        ...overrides,
    };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("store/projectsSlice controller guardrails (T008)", () => {
    it("normalizes legacy stored projects without dropping resource identity", () => {
        const normalized = normalizeStoredProject({
            id: "project-1",
            rootPath: "/tmp/project-1",
            resources: [
                {
                    id: "resource-1",
                },
            ],
        } as StoredProject);

        expect(normalized.folders).toEqual([]);
        expect(normalized.resources).toEqual([
            {
                id: "resource-1",
                name: "",
                metadata: {},
            },
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
                resources: [{ id: "resource-1", name: "Scene One" }],
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
            removeResource({
                projectId: "project-1",
                resourceId: "resource-1",
            }),
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
            renameProject({
                projectId: "project-1",
                newName: "Project Renamed",
            }),
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

describe("store/project-actions-controller guardrails (T017)", () => {
    it("calls rename endpoint with stable payload and invokes callback", async () => {
        const onRename = vi.fn();
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(new Response(null, { status: 200 }));

        await projectActionsController.renameProject({
            projectId: "project-1",
            projectPath: "/tmp/project-1",
            newName: "Project Renamed",
            onRename,
        });

        expect(onRename).toHaveBeenCalledWith("project-1", "Project Renamed");
        expect(fetchSpy).toHaveBeenCalledWith("/api/project/rename", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                projectPath: "/tmp/project-1",
                newName: "Project Renamed",
            }),
        });
    });

    it("calls delete endpoint with stable payload and invokes callback", async () => {
        const onDelete = vi.fn();
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(new Response(null, { status: 200 }));

        await projectActionsController.deleteProject({
            projectId: "project-1",
            projectPath: "/tmp/project-1",
            onDelete,
        });

        expect(onDelete).toHaveBeenCalledWith("project-1");
        expect(fetchSpy).toHaveBeenCalledWith("/api/project/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                projectPath: "/tmp/project-1",
            }),
        });
    });
});
