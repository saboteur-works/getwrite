import { describe, expect, it } from "vitest";
import resourcesReducer, {
  removeResource,
  setResources,
  setFolders,
} from "../../src/store/resourcesSlice";
import { renameMetadataFieldKey } from "../../src/store/projectsSlice";
import { DEFAULT_METADATA_SCHEMA } from "../../src/lib/models/default-metadata-schema";
import type { AnyResource, Folder } from "../../src/lib/models";

function makeTextResource(
  id: string,
  userMetadata?: Record<string, unknown>,
): AnyResource {
  return {
    id,
    name: `Resource ${id}`,
    type: "text",
    slug: id,
    orderIndex: 0,
    createdAt: new Date().toISOString(),
    folderId: null,
    userMetadata,
  } as unknown as AnyResource;
}

function makeFolder(id: string): Folder {
  return {
    id,
    name: `Folder ${id}`,
    type: "folder",
    slug: id,
    orderIndex: 0,
    createdAt: new Date().toISOString(),
    folderId: null,
  } as unknown as Folder;
}

describe("store/resourcesSlice — cross-slice renameMetadataFieldKey coupling (T008-R)", () => {
  it("renames the metadata key on all resources that carry it", () => {
    const initial = resourcesReducer(
      undefined,
      setResources([
        makeTextResource("r1", { pov: "first", status: "draft" }),
        makeTextResource("r2", { pov: "third" }),
        makeTextResource("r3", { status: "done" }),
      ]),
    );

    const nextState = resourcesReducer(
      initial,
      renameMetadataFieldKey.fulfilled(
        { projectId: "p1", schema: DEFAULT_METADATA_SCHEMA },
        "req-id",
        {
          projectId: "p1",
          groupId: "g1",
          fieldKey: "pov",
          newKey: "pointOfView",
        },
      ),
    );

    const r1 = nextState.resources.find((r) => r.id === "r1");
    const r2 = nextState.resources.find((r) => r.id === "r2");
    const r3 = nextState.resources.find((r) => r.id === "r3");

    expect(r1?.userMetadata).toEqual({ pointOfView: "first", status: "draft" });
    expect(r2?.userMetadata).toEqual({ pointOfView: "third" });
    expect(r3?.userMetadata).toEqual({ status: "done" });
  });

  it("does not add the new key to resources that did not have the old key", () => {
    const initial = resourcesReducer(
      undefined,
      setResources([makeTextResource("r1", { genre: "fantasy" })]),
    );

    const nextState = resourcesReducer(
      initial,
      renameMetadataFieldKey.fulfilled(
        { projectId: "p1", schema: DEFAULT_METADATA_SCHEMA },
        "req-id",
        {
          projectId: "p1",
          groupId: "g1",
          fieldKey: "pov",
          newKey: "pointOfView",
        },
      ),
    );

    const r1 = nextState.resources.find((r) => r.id === "r1");
    expect(r1?.userMetadata).not.toHaveProperty("pointOfView");
    expect(r1?.userMetadata).toEqual({ genre: "fantasy" });
  });

  it("is a no-op when no resources have the renamed key", () => {
    const initial = resourcesReducer(
      undefined,
      setResources([makeTextResource("r1", {}), makeTextResource("r2")]),
    );

    const nextState = resourcesReducer(
      initial,
      renameMetadataFieldKey.fulfilled(
        { projectId: "p1", schema: DEFAULT_METADATA_SCHEMA },
        "req-id",
        {
          projectId: "p1",
          groupId: "g1",
          fieldKey: "ghost-field",
          newKey: "other",
        },
      ),
    );

    expect(nextState.resources).toEqual(initial.resources);
  });
});

describe("store/resourcesSlice — removeResource removes from both resources and folders (T008-R)", () => {
  it("removes a resource entry from the resources list by id", () => {
    let state = resourcesReducer(
      undefined,
      setResources([makeTextResource("r1"), makeTextResource("r2")]),
    );

    state = resourcesReducer(state, removeResource("r1"));

    expect(state.resources.map((r) => r.id)).toEqual(["r2"]);
  });

  it("removes a folder entry from the folders list by id", () => {
    let state = resourcesReducer(
      undefined,
      setFolders([makeFolder("f1"), makeFolder("f2")]),
    );
    state = resourcesReducer(state, removeResource("f1"));

    expect(state.folders.map((f) => f.id)).toEqual(["f2"]);
  });

  it("removes from resources but not folders when id is in resources only", () => {
    let state = resourcesReducer(
      undefined,
      setResources([makeTextResource("shared-id")]),
    );
    state = resourcesReducer(state, setFolders([makeFolder("folder-only")]));

    state = resourcesReducer(state, removeResource("shared-id"));

    expect(state.resources).toHaveLength(0);
    expect(state.folders.map((f) => f.id)).toEqual(["folder-only"]);
  });
});
