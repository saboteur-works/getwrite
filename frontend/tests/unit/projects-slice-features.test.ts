/**
 * Unit tests for the feature-toggle / Organizer card-body slice wiring (Task 4).
 *
 * Covers: setProjects hydration of `features`/`organizerCardBody` from project
 * config, the absent-flag-as-disabled selectors (a newly created project reports
 * all six features off), and the `updateProjectFeatures` /
 * `updateProjectOrganizerCardBody` thunks (transport call + store update).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { configureStore } from "@reduxjs/toolkit";
import { DEFAULT_RELATIONSHIP_TYPES } from "../../src/lib/models/default-relationship-types";
import { createEntityRelationship } from "../../src/lib/models/entity-relationships";
import projectsReducer, {
  setProjects,
  setSelectedProjectId,
  updateProjectFeatures,
  updateProjectOrganizerCardBody,
  updateProjectRelationshipTypes,
  selectActiveProjectFeatures,
  selectActiveProjectOrganizerCardBody,
  selectActiveProjectDirectoryId,
  getProjectDirectoryId,
  selectTimelineEnabled,
  selectPovEnabled,
  selectSynopsisEnabled,
  selectNotesEnabled,
  selectEntitiesEnabled,
  selectEntityHighlightingEnabled,
  selectActiveProjectRelationshipTypes,
  buildStoredProject,
} from "../../src/store/projectsSlice";
import type { Project } from "../../src/lib/models/types";

function makeStore() {
  return configureStore({ reducer: { projects: projectsReducer } });
}

function seedProject(
  store: ReturnType<typeof makeStore>,
  config?: Record<string, unknown>,
) {
  store.dispatch(
    setProjects([
      {
        project: {
          id: "project-1",
          name: "Project One",
          rootPath: "/tmp/project-1",
          createdAt: "2026-01-01T00:00:00.000Z",
          ...(config ? { config: config as never } : {}),
        },
        folders: [],
        resources: [],
      },
    ]),
  );
  store.dispatch(setSelectedProjectId("project-1"));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("projectsSlice — feature config hydration (Task 4)", () => {
  it("hydrates features and organizerCardBody from project config via setProjects", () => {
    const store = makeStore();
    seedProject(store, {
      editorConfig: {},
      features: { timeline: true, pov: true },
      organizerCardBody: { source: "text-excerpt", excerptLength: 100 },
    });

    const state = store.getState();
    expect(state.projects.projects["project-1"].features).toEqual({
      timeline: true,
      pov: true,
    });
    expect(state.projects.projects["project-1"].organizerCardBody).toEqual({
      source: "text-excerpt",
      excerptLength: 100,
    });
  });

  it("leaves features/organizerCardBody undefined when the project has none", () => {
    const store = makeStore();
    seedProject(store);
    const state = store.getState();
    expect(state.projects.projects["project-1"].features).toBeUndefined();
    expect(
      state.projects.projects["project-1"].organizerCardBody,
    ).toBeUndefined();
  });
});

describe("projectsSlice — feature selectors (absent = disabled)", () => {
  it("reports all six features disabled for a project with no features", () => {
    const store = makeStore();
    seedProject(store);
    const state = store.getState();
    expect(selectTimelineEnabled(state)).toBe(false);
    expect(selectPovEnabled(state)).toBe(false);
    expect(selectSynopsisEnabled(state)).toBe(false);
    expect(selectNotesEnabled(state)).toBe(false);
    expect(selectEntitiesEnabled(state)).toBe(false);
    expect(selectEntityHighlightingEnabled(state)).toBe(false);
    expect(selectActiveProjectFeatures(state)).toEqual({});
    expect(selectActiveProjectOrganizerCardBody(state)).toBeNull();
  });

  it("returns a stable empty-features reference (no re-render churn)", () => {
    const store = makeStore();
    seedProject(store); // no features block
    const state = store.getState();
    expect(selectActiveProjectFeatures(state)).toBe(
      selectActiveProjectFeatures(state),
    );
  });

  it("reflects enabled features and the card-body config", () => {
    const store = makeStore();
    seedProject(store, {
      editorConfig: {},
      features: { timeline: true, synopsis: true },
      organizerCardBody: { source: "field", fieldKey: "synopsis" },
    });
    const state = store.getState();
    expect(selectTimelineEnabled(state)).toBe(true);
    expect(selectSynopsisEnabled(state)).toBe(true);
    expect(selectPovEnabled(state)).toBe(false);
    expect(selectNotesEnabled(state)).toBe(false);
    expect(selectEntitiesEnabled(state)).toBe(false);
    expect(selectActiveProjectOrganizerCardBody(state)).toEqual({
      source: "field",
      fieldKey: "synopsis",
    });
  });

  it("reflects the entities feature when enabled", () => {
    const store = makeStore();
    seedProject(store, { editorConfig: {}, features: { entities: true } });
    const state = store.getState();
    expect(selectEntitiesEnabled(state)).toBe(true);
  });

  it("reflects the entityHighlighting feature when enabled", () => {
    const store = makeStore();
    seedProject(store, {
      editorConfig: {},
      features: { entityHighlighting: true },
    });
    const state = store.getState();
    expect(selectEntityHighlightingEnabled(state)).toBe(true);
  });

  it("returns disabled/empty when no project is selected", () => {
    const store = makeStore();
    const state = store.getState();
    expect(selectTimelineEnabled(state)).toBe(false);
    expect(selectActiveProjectFeatures(state)).toEqual({});
    expect(selectActiveProjectOrganizerCardBody(state)).toBeNull();
  });
});

describe("projectsSlice — selectActiveProjectRelationshipTypes", () => {
  it("returns the configured relationship-type list verbatim for the active project", () => {
    const store = makeStore();
    seedProject(store, {
      editorConfig: {},
      relationshipTypes: ["ally of", "rival of"],
    });
    const state = store.getState();
    expect(selectActiveProjectRelationshipTypes(state)).toEqual([
      "ally of",
      "rival of",
    ]);
  });

  it("returns DEFAULT_RELATIONSHIP_TYPES when the project has no persisted relationshipTypes (FR-18)", () => {
    const store = makeStore();
    seedProject(store, { editorConfig: {} });
    const state = store.getState();
    expect(selectActiveProjectRelationshipTypes(state)).toEqual(
      DEFAULT_RELATIONSHIP_TYPES,
    );
  });

  it("returns the persisted list verbatim — [] — when the project has explicitly emptied relationshipTypes, rather than falling back to defaults (FR-15)", () => {
    const store = makeStore();
    seedProject(store, { editorConfig: {}, relationshipTypes: [] });
    const state = store.getState();
    expect(selectActiveProjectRelationshipTypes(state)).toEqual([]);
  });

  it("returns DEFAULT_RELATIONSHIP_TYPES when no project is selected", () => {
    const store = makeStore();
    const state = store.getState();
    expect(selectActiveProjectRelationshipTypes(state)).toEqual(
      DEFAULT_RELATIONSHIP_TYPES,
    );
  });

  it("agrees with the model layer's accepted set (FR-15): no persisted list", async () => {
    const tmp = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-relationship-types-agree-"),
    );
    await fs.writeFile(
      path.join(tmp, "project.json"),
      JSON.stringify({ config: {} }, null, 2),
      "utf8",
    );

    const store = makeStore();
    seedProject(store, { editorConfig: {} });
    const selectorTypes = selectActiveProjectRelationshipTypes(
      store.getState(),
    );
    expect(selectorTypes).toEqual(DEFAULT_RELATIONSHIP_TYPES);

    for (const type of selectorTypes) {
      const edge = await createEntityRelationship(
        tmp,
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
        type,
      );
      expect(edge.relationshipType).toBe(type);
    }
    await expect(
      createEntityRelationship(
        tmp,
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
        "not-a-real-type",
      ),
    ).rejects.toThrow();

    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("agrees with the model layer's accepted set (FR-15): persisted empty list", async () => {
    const tmp = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-relationship-types-agree-empty-"),
    );
    await fs.writeFile(
      path.join(tmp, "project.json"),
      JSON.stringify({ config: { relationshipTypes: [] } }, null, 2),
      "utf8",
    );

    const store = makeStore();
    seedProject(store, { editorConfig: {}, relationshipTypes: [] });
    const selectorTypes = selectActiveProjectRelationshipTypes(
      store.getState(),
    );
    expect(selectorTypes).toEqual([]);

    await expect(
      createEntityRelationship(
        tmp,
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
        DEFAULT_RELATIONSHIP_TYPES[0],
      ),
    ).rejects.toThrow();

    await fs.rm(tmp, { recursive: true, force: true });
  });
});

describe("projectsSlice — selectActiveProjectDirectoryId (FR12 basename-vs-id)", () => {
  it("returns the rootPath-derived directory basename, NOT project.id, when they differ", () => {
    // Two independently generated UUIDs: the directory name on disk
    // (rootPath's trailing segment) and project.json's own internal `id`.
    // These are never guaranteed to match — this is the exact landmine
    // FR12 exists to prevent.
    const directoryUuid = "aaaaaaaa-1111-4111-8111-111111111111";
    const internalProjectJsonId = "bbbbbbbb-2222-4222-8222-222222222222";

    const store = makeStore();
    store.dispatch(
      setProjects([
        {
          project: {
            id: internalProjectJsonId,
            name: "Mismatched Project",
            rootPath: `/tmp/projects/${directoryUuid}`,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          folders: [],
          resources: [],
        },
      ]),
    );
    store.dispatch(setSelectedProjectId(internalProjectJsonId));

    const state = store.getState();
    expect(selectActiveProjectDirectoryId(state)).toBe(directoryUuid);
    expect(selectActiveProjectDirectoryId(state)).not.toBe(
      internalProjectJsonId,
    );
  });

  it("returns null when no project is selected", () => {
    const store = makeStore();
    expect(selectActiveProjectDirectoryId(store.getState())).toBeNull();
  });

  it("returns null when the selected project has no rootPath", () => {
    const store = makeStore();
    seedProject(store);
    store.dispatch(setSelectedProjectId("nonexistent-project-id"));
    expect(selectActiveProjectDirectoryId(store.getState())).toBeNull();
  });
});

describe("getProjectDirectoryId (basename extraction helper)", () => {
  it("extracts the trailing POSIX path segment", () => {
    expect(getProjectDirectoryId("/a/b/c/project-uuid")).toBe("project-uuid");
  });

  it("extracts the trailing Windows path segment", () => {
    expect(getProjectDirectoryId("C:\\projects\\project-uuid")).toBe(
      "project-uuid",
    );
  });

  it("strips a trailing slash before extracting the segment", () => {
    expect(getProjectDirectoryId("/a/b/project-uuid/")).toBe("project-uuid");
  });
});

describe("projectsSlice — updateProjectFeatures thunk", () => {
  it("posts the features to the route and updates the store on success", async () => {
    const store = makeStore();
    seedProject(store);

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            features: { timeline: true },
            organizerCardBody: null,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    await store.dispatch(
      updateProjectFeatures({
        projectId: "project-1",
        features: { timeline: true },
      }),
    );

    expect(fetchSpy).toHaveBeenCalledWith("/api/project/features", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: "project-1",
        features: { timeline: true },
      }),
    });

    const state = store.getState();
    expect(selectTimelineEnabled(state)).toBe(true);
  });

  it("rejects when the route returns an error", async () => {
    const store = makeStore();
    seedProject(store);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "boom" }), { status: 500 }),
    );

    const result = await store.dispatch(
      updateProjectFeatures({
        projectId: "project-1",
        features: { timeline: true },
      }),
    );

    expect(result.type).toBe("projects/updateProjectFeatures/rejected");
    expect(selectTimelineEnabled(store.getState())).toBe(false);
  });
});

describe("projectsSlice — updateProjectOrganizerCardBody thunk", () => {
  it("posts the card-body config and updates the store on success", async () => {
    const store = makeStore();
    seedProject(store);

    const body = { source: "text-excerpt" as const, excerptLength: 80 };
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ features: {}, organizerCardBody: body }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    await store.dispatch(
      updateProjectOrganizerCardBody({
        projectId: "project-1",
        organizerCardBody: body,
      }),
    );

    expect(fetchSpy).toHaveBeenCalledWith("/api/project/features", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: "project-1", organizerCardBody: body }),
    });

    expect(selectActiveProjectOrganizerCardBody(store.getState())).toEqual(
      body,
    );
  });
});

describe("projectsSlice — updateProjectRelationshipTypes thunk (FR-19)", () => {
  it("posts the relationship-type list and updates the store on success", async () => {
    const store = makeStore();
    seedProject(store);

    const relationshipTypes = ["ally of", "rival of"];
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ features: {}, relationshipTypes }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    await store.dispatch(
      updateProjectRelationshipTypes({
        projectId: "project-1",
        relationshipTypes,
      }),
    );

    expect(fetchSpy).toHaveBeenCalledWith("/api/project/features", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: "project-1", relationshipTypes }),
    });

    expect(selectActiveProjectRelationshipTypes(store.getState())).toEqual(
      relationshipTypes,
    );
  });

  it("rejects when the route returns an error and leaves relationshipTypes untouched", async () => {
    const store = makeStore();
    seedProject(store, { editorConfig: {}, relationshipTypes: ["ally of"] });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "boom" }), { status: 500 }),
    );

    const result = await store.dispatch(
      updateProjectRelationshipTypes({
        projectId: "project-1",
        relationshipTypes: ["mentor of"],
      }),
    );

    expect(result.type).toBe(
      "projects/updateProjectRelationshipTypes/rejected",
    );
    expect(selectActiveProjectRelationshipTypes(store.getState())).toEqual([
      "ally of",
    ]);
  });
});

describe("buildStoredProject", () => {
  function makeProject(config?: Project["config"]): Project {
    return {
      id: "proj-1",
      name: "Proj",
      createdAt: "2024-01-01T00:00:00.000Z",
      rootPath: "/tmp/proj-1",
      ...(config ? { config } : {}),
    };
  }

  it("carries features and organizerCardBody from project config (fixes reopen persistence)", () => {
    const stored = buildStoredProject(
      makeProject({
        editorConfig: {},
        features: { timeline: true, timelineView: true, notes: true },
        organizerCardBody: { source: "text-excerpt", excerptLength: 100 },
      }),
      [],
      [],
    );
    expect(stored.features).toEqual({
      timeline: true,
      timelineView: true,
      notes: true,
    });
    expect(stored.organizerCardBody).toEqual({
      source: "text-excerpt",
      excerptLength: 100,
    });
  });

  it("carries statuses and metadataSchema", () => {
    const stored = buildStoredProject(
      makeProject({
        editorConfig: {},
        statuses: ["draft", "done"],
        metadataSchema: { groups: [] },
      }),
      [],
      [],
    );
    expect(stored.statuses).toEqual(["draft", "done"]);
    expect(stored.metadataSchema).toEqual({ groups: [] });
  });

  it("carries relationshipTypes", () => {
    const stored = buildStoredProject(
      makeProject({
        editorConfig: {},
        relationshipTypes: ["ally of", "rival of"],
      }),
      [],
      [],
    );
    expect(stored.relationshipTypes).toEqual(["ally of", "rival of"]);
  });

  it("leaves features/organizerCardBody undefined for a project with no config", () => {
    const stored = buildStoredProject(makeProject(), [], []);
    expect(stored.features).toBeUndefined();
    expect(stored.organizerCardBody).toBeUndefined();
  });

  it("maps resources to the minimal ResourceMeta shape with defaults", () => {
    const stored = buildStoredProject(
      makeProject({ editorConfig: {} }),
      [],
      [
        { id: "r1", name: "Scene", folderId: "f1", userMetadata: { pov: "A" } },
        { id: "r2" },
      ],
    );
    expect(stored.resources).toEqual([
      { id: "r1", name: "Scene", folderId: "f1", userMetadata: { pov: "A" } },
      { id: "r2", name: "", folderId: null, userMetadata: {} },
    ]);
  });
});
