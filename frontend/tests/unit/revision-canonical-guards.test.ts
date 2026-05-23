import { describe, expect, it } from "vitest";

import revisionsReducer, {
  clearRevisions,
  deleteRevisionForSelectedResource,
  fetchRevisionContentForSelectedResource,
  loadRevisionsForSelectedResource,
  saveRevisionForSelectedResource,
  setCanonicalRevisionForSelectedResource,
  setCanonicalRevisionId,
  type RevisionEntry,
  type RevisionsState,
} from "../../src/store/revisionsSlice";
import { setSelectedResourceId } from "../../src/store/resourcesSlice";

function createRevisionEntry(overrides: Partial<RevisionEntry>): RevisionEntry {
  const versionNumber = overrides.versionNumber ?? 1;
  const resourceId = overrides.resourceId ?? "resource-1";
  const revisionId = overrides.id ?? `revision-${versionNumber}`;

  return {
    id: revisionId,
    resourceId,
    versionNumber,
    createdAt: `2026-03-21T12:00:0${versionNumber}.000Z`,
    filePath: `/tmp/${revisionId}.json`,
    isCanonical: false,
    displayName: `Revision v${versionNumber}`,
    ...overrides,
  };
}

function createState(revisions: RevisionEntry[]): RevisionsState {
  return {
    resourceId: "resource-1",
    requestedResourceId: null,
    currentRevisionId: revisions[0]?.id ?? null,
    currentRevisionContent: "preview",
    revisions,
    isLoading: false,
    isSaving: false,
    fetchingRevisionId: null,
    deletingRevisionId: null,
    errorMessage: "",
  };
}

describe("store/revisionsSlice canonical guardrails (T008)", () => {
  it("marks exactly one revision canonical when the local reducer updates the active revision", () => {
    const state = createState([
      createRevisionEntry({ id: "revision-1", versionNumber: 1 }),
      createRevisionEntry({
        id: "revision-2",
        versionNumber: 2,
        isCanonical: true,
      }),
      createRevisionEntry({ id: "revision-3", versionNumber: 3 }),
    ]);

    const nextState = revisionsReducer(
      state,
      setCanonicalRevisionId("revision-3"),
    );

    expect(nextState.currentRevisionId).toBe("revision-3");
    expect(
      nextState.revisions.filter((revision) => revision.isCanonical),
    ).toEqual([
      expect.objectContaining({ id: "revision-3", isCanonical: true }),
    ]);
  });

  it("preserves the single-canonical invariant when the async canonical action fulfills", () => {
    const state = createState([
      createRevisionEntry({
        id: "revision-1",
        versionNumber: 1,
        isCanonical: true,
      }),
      createRevisionEntry({ id: "revision-2", versionNumber: 2 }),
      createRevisionEntry({ id: "revision-3", versionNumber: 3 }),
    ]);

    const nextState = revisionsReducer(
      state,
      setCanonicalRevisionForSelectedResource.fulfilled(
        { resourceId: "resource-1", revisionId: "revision-2" },
        "request-id",
        { resourceId: "resource-1", revisionId: "revision-2" },
      ),
    );

    expect(nextState.currentRevisionId).toBe("revision-2");
    expect(
      nextState.revisions.filter((revision) => revision.isCanonical),
    ).toHaveLength(1);
    expect(
      nextState.revisions.find((revision) => revision.isCanonical)?.id,
    ).toBe("revision-2");
  });

  it("ignores canonical updates that resolve for a stale resource", () => {
    const state = createState([
      createRevisionEntry({
        id: "revision-1",
        versionNumber: 1,
        isCanonical: true,
      }),
      createRevisionEntry({ id: "revision-2", versionNumber: 2 }),
    ]);

    const nextState = revisionsReducer(
      { ...state, resourceId: "resource-2" },
      setCanonicalRevisionForSelectedResource.fulfilled(
        { resourceId: "resource-1", revisionId: "revision-2" },
        "request-id",
        { resourceId: "resource-1", revisionId: "revision-2" },
      ),
    );

    expect(nextState).toEqual({ ...state, resourceId: "resource-2" });
  });
});

describe("store/revisionsSlice — stale-resource guards (T008-S)", () => {
  it("ignores a fulfilled load when the requestedResourceId has changed (race guard)", () => {
    const state = createState([]);
    const stateWithRequest: RevisionsState = {
      ...state,
      requestedResourceId: "resource-2",
      isLoading: true,
    };

    const nextState = revisionsReducer(
      stateWithRequest,
      loadRevisionsForSelectedResource.fulfilled(
        {
          resourceId: "resource-1",
          revisions: [
            createRevisionEntry({
              id: "revision-1",
              versionNumber: 1,
              isCanonical: true,
            }),
          ],
          currentRevisionId: "revision-1",
        },
        "request-id",
        { resourceId: "resource-1" },
      ),
    );

    expect(nextState).toEqual(stateWithRequest);
  });

  it("ignores a rejected load when the requestedResourceId has changed (race guard)", () => {
    const state = createState([]);
    const stateWithRequest: RevisionsState = {
      ...state,
      requestedResourceId: "resource-2",
      isLoading: true,
    };

    const nextState = revisionsReducer(
      stateWithRequest,
      loadRevisionsForSelectedResource.rejected(
        new Error("Network error"),
        "request-id",
        { resourceId: "resource-1" },
        "Unable to load revisions.",
      ),
    );

    expect(nextState).toEqual(stateWithRequest);
  });

  it("resets revision state when navigating to a different resource", () => {
    const populated = createState([
      createRevisionEntry({
        id: "revision-1",
        versionNumber: 1,
        isCanonical: true,
      }),
      createRevisionEntry({ id: "revision-2", versionNumber: 2 }),
    ]);

    const nextState = revisionsReducer(
      populated,
      setSelectedResourceId("resource-2"),
    );

    expect(nextState.resourceId).toBeNull();
    expect(nextState.revisions).toEqual([]);
    expect(nextState.currentRevisionId).toBeNull();
    expect(nextState.isLoading).toBe(false);
  });

  it("does NOT reset revision state when re-selecting the same resource", () => {
    const populated = createState([
      createRevisionEntry({
        id: "revision-1",
        versionNumber: 1,
        isCanonical: true,
      }),
    ]);

    const nextState = revisionsReducer(
      populated,
      setSelectedResourceId("resource-1"),
    );

    expect(nextState).toEqual(populated);
  });

  it("auto-advances currentRevisionId to the canonical when the active revision is deleted", () => {
    const state = createState([
      createRevisionEntry({
        id: "revision-1",
        versionNumber: 1,
        isCanonical: true,
      }),
      createRevisionEntry({
        id: "revision-2",
        versionNumber: 2,
        isCanonical: false,
      }),
    ]);
    const stateViewing2: RevisionsState = {
      ...state,
      currentRevisionId: "revision-2",
    };

    const nextState = revisionsReducer(
      stateViewing2,
      deleteRevisionForSelectedResource.fulfilled(
        { resourceId: "resource-1", revisionId: "revision-2" },
        "request-id",
        { resourceId: "resource-1", revisionId: "revision-2" },
      ),
    );

    expect(nextState.revisions.map((r) => r.id)).toEqual(["revision-1"]);
    expect(nextState.currentRevisionId).toBe("revision-1");
    expect(nextState.currentRevisionContent).toBeNull();
  });

  it("ignores a fulfilled delete for a stale resource (cross-resource delete guard)", () => {
    const state = createState([
      createRevisionEntry({
        id: "revision-1",
        versionNumber: 1,
        isCanonical: true,
      }),
    ]);

    const nextState = revisionsReducer(
      state,
      deleteRevisionForSelectedResource.fulfilled(
        { resourceId: "resource-99", revisionId: "revision-1" },
        "request-id",
        { resourceId: "resource-99", revisionId: "revision-1" },
      ),
    );

    expect(nextState).toEqual(state);
  });

  it("ignores a fulfilled save for a resource that is no longer active", () => {
    const state = createState([
      createRevisionEntry({
        id: "revision-1",
        versionNumber: 1,
        isCanonical: true,
      }),
    ]);

    const nextState = revisionsReducer(
      state,
      saveRevisionForSelectedResource.fulfilled(
        {
          resourceId: "resource-99",
          revision: createRevisionEntry({ id: "revision-x", versionNumber: 9 }),
        },
        "request-id",
        { resourceId: "resource-99", revisionName: "Stale Save" },
      ),
    );

    expect(nextState.revisions).toHaveLength(1);
    expect(nextState.revisions[0].id).toBe("revision-1");
  });

  it("ignores a rejected content fetch when fetchingRevisionId has changed", () => {
    const state: RevisionsState = {
      ...createState([
        createRevisionEntry({
          id: "revision-1",
          versionNumber: 1,
          isCanonical: true,
        }),
      ]),
      fetchingRevisionId: "revision-2",
    };

    const nextState = revisionsReducer(
      state,
      fetchRevisionContentForSelectedResource.rejected(
        new Error(""),
        "request-id",
        { resourceId: "resource-1", revisionId: "revision-1" },
        "Failed to fetch revision.",
      ),
    );

    expect(nextState.fetchingRevisionId).toBe("revision-2");
    expect(nextState.errorMessage).toBe("");
  });

  it("clearRevisions resets the entire slice to the empty initial state", () => {
    const populated = createState([
      createRevisionEntry({
        id: "revision-1",
        versionNumber: 1,
        isCanonical: true,
      }),
    ]);

    const nextState = revisionsReducer(populated, clearRevisions());

    expect(nextState.resourceId).toBeNull();
    expect(nextState.revisions).toEqual([]);
    expect(nextState.currentRevisionId).toBeNull();
    expect(nextState.isLoading).toBe(false);
    expect(nextState.isSaving).toBe(false);
  });
});
