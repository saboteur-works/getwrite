import { afterEach, describe, expect, it, vi } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import projectsReducer, {
  addMetadataField,
  removeMetadataField,
  reorderMetadataFields,
  renameMetadataField,
  updateMetadataFieldOptions,
  addMetadataGroup,
  removeMetadataGroup,
  reorderMetadataGroups,
  updateProjectMetadataSchema,
  updateMetadataRefProperties,
  setProject,
} from "../../src/store/projectsSlice";
import type {
  MetadataField,
  MetadataGroup,
  MetadataSchema,
} from "../../src/lib/models/types";

// A minimal store that exercises only the projects slice. The thunks use
// `state: any` so they work correctly even without the full root state.
function makeTestStore() {
  return configureStore({ reducer: { projects: projectsReducer } });
}

function seedProject(
  store: ReturnType<typeof makeTestStore>,
  overrides?: { rootPath?: string },
) {
  store.dispatch(
    setProject({
      id: "project-1",
      name: "Test Project",
      rootPath: overrides?.rootPath ?? "/tmp/project-1",
    }),
  );
}

const updatedSchema: MetadataSchema = {
  groups: [
    {
      id: "test-group",
      label: "Test",
      fields: [{ key: "new-field", label: "New Field", type: "text" }],
    },
  ],
};

function mockFetchSuccess() {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      new Response(JSON.stringify({ schema: updatedSchema }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
}

function mockFetchError(status: number, error: string) {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ error, details: error }), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// updateProjectMetadataSchema reducer (direct dispatch)
// ---------------------------------------------------------------------------

describe("updateProjectMetadataSchema reducer (Task 6)", () => {
  it("replaces metadataSchema for the target project without touching other fields", () => {
    const store = makeTestStore();
    seedProject(store);

    const schema: MetadataSchema = {
      groups: [{ id: "g1", label: "G", fields: [] }],
    };
    store.dispatch(
      updateProjectMetadataSchema({ projectId: "project-1", schema }),
    );

    expect(
      store.getState().projects.projects["project-1"].metadataSchema,
    ).toEqual(schema);
    expect(store.getState().projects.projects["project-1"].name).toBe(
      "Test Project",
    );
  });

  it("does nothing when the project does not exist", () => {
    const store = makeTestStore();
    const before = store.getState().projects.projects;

    store.dispatch(
      updateProjectMetadataSchema({
        projectId: "ghost",
        schema: { groups: [] },
      }),
    );

    expect(store.getState().projects.projects).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// addMetadataField thunk
// ---------------------------------------------------------------------------

describe("addMetadataField thunk (Task 6)", () => {
  const field: MetadataField = {
    key: "new-field",
    label: "New Field",
    type: "text",
  };

  it("calls the API with the correct payload and updates metadataSchema in Redux on success", async () => {
    const store = makeTestStore();
    seedProject(store);
    const fetchSpy = mockFetchSuccess();

    const result = await store.dispatch(
      addMetadataField({
        projectId: "project-1",
        groupId: "test-group",
        field,
      }),
    );

    expect(result.meta.requestStatus).toBe("fulfilled");
    expect(fetchSpy).toHaveBeenCalledWith("/api/project/metadata-schema", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "add-field",
        projectPath: "/tmp/project-1",
        groupId: "test-group",
        field,
      }),
    });
    expect(
      store.getState().projects.projects["project-1"].metadataSchema,
    ).toEqual(updatedSchema);
  });

  it("rejects with an error message and leaves state unchanged when the API returns an error", async () => {
    const store = makeTestStore();
    seedProject(store);
    const schemaBefore =
      store.getState().projects.projects["project-1"].metadataSchema;

    mockFetchError(400, "Field already exists");

    const result = await store.dispatch(
      addMetadataField({
        projectId: "project-1",
        groupId: "test-group",
        field,
      }),
    );

    expect(result.meta.requestStatus).toBe("rejected");
    expect(
      store.getState().projects.projects["project-1"].metadataSchema,
    ).toEqual(schemaBefore);
  });

  it("rejects without calling the API when the project is not found", async () => {
    const store = makeTestStore();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    const result = await store.dispatch(
      addMetadataField({ projectId: "nonexistent", groupId: "g", field }),
    );

    expect(result.meta.requestStatus).toBe("rejected");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects without calling the API when the project has no rootPath", async () => {
    const store = makeTestStore();
    store.dispatch(
      setProject({ id: "project-no-path", name: "No Path", rootPath: "" }),
    );
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    const result = await store.dispatch(
      addMetadataField({ projectId: "project-no-path", groupId: "g", field }),
    );

    expect(result.meta.requestStatus).toBe("rejected");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// removeMetadataField thunk
// ---------------------------------------------------------------------------

describe("removeMetadataField thunk (Task 6)", () => {
  it("calls the API and updates metadataSchema on success", async () => {
    const store = makeTestStore();
    seedProject(store);
    const fetchSpy = mockFetchSuccess();

    const result = await store.dispatch(
      removeMetadataField({
        projectId: "project-1",
        groupId: "test-group",
        fieldKey: "old-field",
      }),
    );

    expect(result.meta.requestStatus).toBe("fulfilled");
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/project/metadata-schema",
      expect.objectContaining({
        body: JSON.stringify({
          action: "remove-field",
          projectPath: "/tmp/project-1",
          groupId: "test-group",
          fieldKey: "old-field",
        }),
      }),
    );
    expect(
      store.getState().projects.projects["project-1"].metadataSchema,
    ).toEqual(updatedSchema);
  });

  it("rejects on API error and leaves schema unchanged", async () => {
    const store = makeTestStore();
    seedProject(store);
    const schemaBefore =
      store.getState().projects.projects["project-1"].metadataSchema;
    mockFetchError(400, "Field is locked");

    const result = await store.dispatch(
      removeMetadataField({
        projectId: "project-1",
        groupId: "g",
        fieldKey: "locked-field",
      }),
    );

    expect(result.meta.requestStatus).toBe("rejected");
    expect(
      store.getState().projects.projects["project-1"].metadataSchema,
    ).toEqual(schemaBefore);
  });
});

// ---------------------------------------------------------------------------
// reorderMetadataFields thunk
// ---------------------------------------------------------------------------

describe("reorderMetadataFields thunk (Task 6)", () => {
  it("calls the API and updates metadataSchema on success", async () => {
    const store = makeTestStore();
    seedProject(store);
    const fetchSpy = mockFetchSuccess();

    const result = await store.dispatch(
      reorderMetadataFields({
        projectId: "project-1",
        groupId: "test-group",
        newKeyOrder: ["field-b", "field-a"],
      }),
    );

    expect(result.meta.requestStatus).toBe("fulfilled");
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/project/metadata-schema",
      expect.objectContaining({
        body: JSON.stringify({
          action: "reorder-fields",
          projectPath: "/tmp/project-1",
          groupId: "test-group",
          newKeyOrder: ["field-b", "field-a"],
        }),
      }),
    );
    expect(
      store.getState().projects.projects["project-1"].metadataSchema,
    ).toEqual(updatedSchema);
  });
});

// ---------------------------------------------------------------------------
// renameMetadataField thunk
// ---------------------------------------------------------------------------

describe("renameMetadataField thunk (Task 6)", () => {
  it("calls the API and updates metadataSchema on success", async () => {
    const store = makeTestStore();
    seedProject(store);
    const fetchSpy = mockFetchSuccess();

    const result = await store.dispatch(
      renameMetadataField({
        projectId: "project-1",
        groupId: "test-group",
        fieldKey: "my-field",
        newLabel: "Renamed",
      }),
    );

    expect(result.meta.requestStatus).toBe("fulfilled");
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/project/metadata-schema",
      expect.objectContaining({
        body: JSON.stringify({
          action: "rename-field",
          projectPath: "/tmp/project-1",
          groupId: "test-group",
          fieldKey: "my-field",
          newLabel: "Renamed",
        }),
      }),
    );
    expect(
      store.getState().projects.projects["project-1"].metadataSchema,
    ).toEqual(updatedSchema);
  });
});

// ---------------------------------------------------------------------------
// updateMetadataFieldOptions thunk
// ---------------------------------------------------------------------------

describe("updateMetadataFieldOptions thunk (Task 6)", () => {
  it("calls the API and updates metadataSchema on success", async () => {
    const store = makeTestStore();
    seedProject(store);
    const fetchSpy = mockFetchSuccess();

    const result = await store.dispatch(
      updateMetadataFieldOptions({
        projectId: "project-1",
        groupId: "test-group",
        fieldKey: "status",
        options: ["Draft", "Final"],
      }),
    );

    expect(result.meta.requestStatus).toBe("fulfilled");
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/project/metadata-schema",
      expect.objectContaining({
        body: JSON.stringify({
          action: "update-field-options",
          projectPath: "/tmp/project-1",
          groupId: "test-group",
          fieldKey: "status",
          options: ["Draft", "Final"],
        }),
      }),
    );
    expect(
      store.getState().projects.projects["project-1"].metadataSchema,
    ).toEqual(updatedSchema);
  });
});

// ---------------------------------------------------------------------------
// addMetadataGroup thunk
// ---------------------------------------------------------------------------

describe("addMetadataGroup thunk (Task 6)", () => {
  const group: MetadataGroup = {
    id: "new-group",
    label: "New Group",
    fields: [],
  };

  it("calls the API and updates metadataSchema on success", async () => {
    const store = makeTestStore();
    seedProject(store);
    const fetchSpy = mockFetchSuccess();

    const result = await store.dispatch(
      addMetadataGroup({ projectId: "project-1", group }),
    );

    expect(result.meta.requestStatus).toBe("fulfilled");
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/project/metadata-schema",
      expect.objectContaining({
        body: JSON.stringify({
          action: "add-group",
          projectPath: "/tmp/project-1",
          group,
        }),
      }),
    );
    expect(
      store.getState().projects.projects["project-1"].metadataSchema,
    ).toEqual(updatedSchema);
  });
});

// ---------------------------------------------------------------------------
// removeMetadataGroup thunk
// ---------------------------------------------------------------------------

describe("removeMetadataGroup thunk (Task 6)", () => {
  it("calls the API and updates metadataSchema on success", async () => {
    const store = makeTestStore();
    seedProject(store);
    const fetchSpy = mockFetchSuccess();

    const result = await store.dispatch(
      removeMetadataGroup({ projectId: "project-1", groupId: "old-group" }),
    );

    expect(result.meta.requestStatus).toBe("fulfilled");
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/project/metadata-schema",
      expect.objectContaining({
        body: JSON.stringify({
          action: "remove-group",
          projectPath: "/tmp/project-1",
          groupId: "old-group",
        }),
      }),
    );
    expect(
      store.getState().projects.projects["project-1"].metadataSchema,
    ).toEqual(updatedSchema);
  });
});

// ---------------------------------------------------------------------------
// reorderMetadataGroups thunk
// ---------------------------------------------------------------------------

describe("reorderMetadataGroups thunk (Task 6)", () => {
  it("calls the API and updates metadataSchema on success", async () => {
    const store = makeTestStore();
    seedProject(store);
    const fetchSpy = mockFetchSuccess();

    const result = await store.dispatch(
      reorderMetadataGroups({
        projectId: "project-1",
        newGroupIdOrder: ["group-b", "group-a"],
      }),
    );

    expect(result.meta.requestStatus).toBe("fulfilled");
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/project/metadata-schema",
      expect.objectContaining({
        body: JSON.stringify({
          action: "reorder-groups",
          projectPath: "/tmp/project-1",
          newGroupIdOrder: ["group-b", "group-a"],
        }),
      }),
    );
    expect(
      store.getState().projects.projects["project-1"].metadataSchema,
    ).toEqual(updatedSchema);
  });
});

// ---------------------------------------------------------------------------
// updateMetadataRefProperties thunk
// ---------------------------------------------------------------------------

describe("updateMetadataRefProperties thunk (Task 3)", () => {
  it("calls the API with the correct payload and updates metadataSchema on success", async () => {
    const store = makeTestStore();
    seedProject(store);
    const fetchSpy = mockFetchSuccess();

    const result = await store.dispatch(
      updateMetadataRefProperties({
        projectId: "project-1",
        groupId: "test-group",
        fieldKey: "characters",
        updates: { refFolder: "folder-abc", maxSelections: 3 },
      }),
    );

    expect(result.meta.requestStatus).toBe("fulfilled");
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/project/metadata-schema",
      expect.objectContaining({
        body: JSON.stringify({
          action: "update-ref-properties",
          projectPath: "/tmp/project-1",
          groupId: "test-group",
          fieldKey: "characters",
          refFolder: "folder-abc",
          maxSelections: 3,
        }),
      }),
    );
    expect(
      store.getState().projects.projects["project-1"].metadataSchema,
    ).toEqual(updatedSchema);
  });

  it("omits undefined updates from the request body", async () => {
    const store = makeTestStore();
    seedProject(store);
    const fetchSpy = mockFetchSuccess();

    await store.dispatch(
      updateMetadataRefProperties({
        projectId: "project-1",
        groupId: "test-group",
        fieldKey: "characters",
        updates: { maxSelections: 5 },
      }),
    );

    const sentBody = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(sentBody).not.toHaveProperty("refFolder");
    expect(sentBody).not.toHaveProperty("includeSubfolders");
    expect(sentBody.maxSelections).toBe(5);
  });

  it("sends null explicitly for properties being cleared", async () => {
    const store = makeTestStore();
    seedProject(store);
    const fetchSpy = mockFetchSuccess();

    await store.dispatch(
      updateMetadataRefProperties({
        projectId: "project-1",
        groupId: "test-group",
        fieldKey: "characters",
        updates: { refFolder: null },
      }),
    );

    const sentBody = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(sentBody.refFolder).toBeNull();
  });

  it("rejects and leaves state unchanged when the API returns an error", async () => {
    const store = makeTestStore();
    seedProject(store);
    const schemaBefore =
      store.getState().projects.projects["project-1"].metadataSchema;

    mockFetchError(400, "Cannot update ref properties of locked field");

    const result = await store.dispatch(
      updateMetadataRefProperties({
        projectId: "project-1",
        groupId: "test-group",
        fieldKey: "locked-field",
        updates: { refFolder: "x" },
      }),
    );

    expect(result.meta.requestStatus).toBe("rejected");
    expect(
      store.getState().projects.projects["project-1"].metadataSchema,
    ).toEqual(schemaBefore);
  });
});
