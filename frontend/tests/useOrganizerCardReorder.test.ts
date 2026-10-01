import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AnyResource, Folder } from "../src/lib/models";
import type { AppDispatch } from "../src/store/store";

vi.mock("../src/store/resourcesSlice", () => ({
  updateFolders: (payload: unknown) => ({
    type: "resources/updateFolders",
    payload,
  }),
  updateResources: (payload: unknown) => ({
    type: "resources/updateResources",
    payload,
  }),
  persistReorder: (payload: unknown) => ({
    type: "projects/persistReorder",
    payload,
  }),
}));

import { useOrganizerCardReorder } from "../components/WorkArea/Views/OrganizerView/useOrganizerCardReorder";

const BROWSED_FOLDER_ID = "folder-browsed";

function makeFolder(id: string, orderIndex: number): Folder {
  return {
    id,
    type: "folder",
    name: id,
    parentId: BROWSED_FOLDER_ID,
    folderId: BROWSED_FOLDER_ID,
    orderIndex,
  } as unknown as Folder;
}

function makeResource(id: string, orderIndex: number): AnyResource {
  return {
    id,
    type: "text",
    name: id,
    folderId: BROWSED_FOLDER_ID,
    orderIndex,
  } as unknown as AnyResource;
}

describe("useOrganizerCardReorder", () => {
  let dispatchMock: ReturnType<typeof vi.fn>;
  let dispatch: AppDispatch;
  const currentProject = { id: "proj-1", rootPath: "/tmp/proj-1" };
  const projectDirectoryId = "proj-1-dir";

  beforeEach(() => {
    dispatchMock = vi.fn();
    dispatch = dispatchMock as unknown as AppDispatch;
  });

  it("assigns a dense, zero-based orderIndex sequence for an all-folder set", () => {
    const allChildren = [
      makeFolder("f1", 0),
      makeFolder("f2", 1),
      makeFolder("f3", 2),
    ];
    const reorder = useOrganizerCardReorder({
      dispatch,
      currentProject,
      projectDirectoryId,
      browsedFolderId: BROWSED_FOLDER_ID,
      allChildren,
    });

    reorder(["f3", "f1", "f2"]);

    const updateFoldersCall = dispatchMock.mock.calls.find(
      (call) => call[0].type === "resources/updateFolders",
    );
    expect(updateFoldersCall).toBeDefined();
    const folderOrder = updateFoldersCall![0].payload as Array<{
      id: string;
      orderIndex: number;
    }>;
    expect(folderOrder.map((f) => f.orderIndex)).toEqual([0, 1, 2]);
    expect(folderOrder.map((f) => f.id)).toEqual(["f3", "f1", "f2"]);

    const updateResourcesCall = dispatchMock.mock.calls.find(
      (call) => call[0].type === "resources/updateResources",
    );
    expect(updateResourcesCall).toBeUndefined();
  });

  it("assigns a dense, zero-based orderIndex sequence for an all-resource set", () => {
    const allChildren = [
      makeResource("r1", 0),
      makeResource("r2", 1),
      makeResource("r3", 2),
    ];
    const reorder = useOrganizerCardReorder({
      dispatch,
      currentProject,
      projectDirectoryId,
      browsedFolderId: BROWSED_FOLDER_ID,
      allChildren,
    });

    reorder(["r2", "r3", "r1"]);

    const updateResourcesCall = dispatchMock.mock.calls.find(
      (call) => call[0].type === "resources/updateResources",
    );
    expect(updateResourcesCall).toBeDefined();
    const resourceOrder = updateResourcesCall![0].payload as Array<{
      id: string;
      orderIndex: number;
    }>;
    expect(resourceOrder.map((r) => r.orderIndex)).toEqual([0, 1, 2]);
    expect(resourceOrder.map((r) => r.id)).toEqual(["r2", "r3", "r1"]);

    const updateFoldersCall = dispatchMock.mock.calls.find(
      (call) => call[0].type === "resources/updateFolders",
    );
    expect(updateFoldersCall).toBeUndefined();
  });

  it("uses a single running counter across a mixed folder+resource set", () => {
    const allChildren = [
      makeFolder("f1", 0),
      makeResource("r1", 1),
      makeFolder("f2", 2),
      makeResource("r2", 3),
    ];
    const reorder = useOrganizerCardReorder({
      dispatch,
      currentProject,
      projectDirectoryId,
      browsedFolderId: BROWSED_FOLDER_ID,
      allChildren,
    });

    // New order: r2, f1, r1, f2
    reorder(["r2", "f1", "r1", "f2"]);

    const updateFoldersCall = dispatchMock.mock.calls.find(
      (call) => call[0].type === "resources/updateFolders",
    );
    const updateResourcesCall = dispatchMock.mock.calls.find(
      (call) => call[0].type === "resources/updateResources",
    );
    expect(updateFoldersCall).toBeDefined();
    expect(updateResourcesCall).toBeDefined();

    const folderOrder = updateFoldersCall![0].payload as Array<{
      id: string;
      orderIndex: number;
      folderId?: string | null;
      parentId?: string | null;
    }>;
    const resourceOrder = updateResourcesCall![0].payload as Array<{
      id: string;
      orderIndex: number;
      folderId?: string | null;
    }>;

    // r2 is index 0, f1 is index 1, r1 is index 2, f2 is index 3 — a single
    // running counter over the combined new-order walk.
    expect(resourceOrder.find((r) => r.id === "r2")!.orderIndex).toBe(0);
    expect(folderOrder.find((f) => f.id === "f1")!.orderIndex).toBe(1);
    expect(resourceOrder.find((r) => r.id === "r1")!.orderIndex).toBe(2);
    expect(folderOrder.find((f) => f.id === "f2")!.orderIndex).toBe(3);

    // No re-parenting: every entry's folderId/parentId is the browsed
    // folder's own id.
    for (const f of folderOrder) {
      expect(f.folderId).toBe(BROWSED_FOLDER_ID);
      expect(f.parentId).toBe(BROWSED_FOLDER_ID);
    }
    for (const r of resourceOrder) {
      expect(r.folderId).toBe(BROWSED_FOLDER_ID);
    }
  });

  it("dispatches persistReorder with the browsed folder's id as folderId for every entry", () => {
    const allChildren = [makeFolder("f1", 0), makeResource("r1", 1)];
    const reorder = useOrganizerCardReorder({
      dispatch,
      currentProject,
      projectDirectoryId,
      browsedFolderId: BROWSED_FOLDER_ID,
      allChildren,
    });

    reorder(["r1", "f1"]);

    const persistCall = dispatchMock.mock.calls.find(
      (call) => call[0].type === "projects/persistReorder",
    );
    expect(persistCall).toBeDefined();
    const payload = persistCall![0].payload as {
      projectId: string;
      projectRoot: string;
      folderOrder: Array<{ id: string; folderId?: string | null }>;
      resourceOrder: Array<{ id: string; folderId?: string | null }>;
    };
    expect(payload.projectId).toBe(projectDirectoryId);
    expect(payload.projectRoot).toBe(currentProject.rootPath);
    for (const f of payload.folderOrder) {
      expect(f.folderId).toBe(BROWSED_FOLDER_ID);
    }
    for (const r of payload.resourceOrder) {
      expect(r.folderId).toBe(BROWSED_FOLDER_ID);
    }
  });

  it("does not dispatch persistReorder when currentProject is missing", () => {
    const allChildren = [makeResource("r1", 0), makeResource("r2", 1)];
    const reorder = useOrganizerCardReorder({
      dispatch,
      currentProject: null,
      projectDirectoryId,
      browsedFolderId: BROWSED_FOLDER_ID,
      allChildren,
    });

    reorder(["r2", "r1"]);

    const persistCall = dispatchMock.mock.calls.find(
      (call) => call[0].type === "projects/persistReorder",
    );
    expect(persistCall).toBeUndefined();
    // The optimistic update still happens.
    const updateResourcesCall = dispatchMock.mock.calls.find(
      (call) => call[0].type === "resources/updateResources",
    );
    expect(updateResourcesCall).toBeDefined();
  });

  it("does not dispatch persistReorder when the directory id is missing", () => {
    const allChildren = [makeResource("r1", 0), makeResource("r2", 1)];
    const reorder = useOrganizerCardReorder({
      dispatch,
      currentProject,
      projectDirectoryId: null,
      browsedFolderId: BROWSED_FOLDER_ID,
      allChildren,
    });

    reorder(["r2", "r1"]);

    const persistCall = dispatchMock.mock.calls.find(
      (call) => call[0].type === "projects/persistReorder",
    );
    expect(persistCall).toBeUndefined();
  });
});
