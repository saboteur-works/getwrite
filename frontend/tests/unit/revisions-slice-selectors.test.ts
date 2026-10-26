import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/store/revision-transport-service", async (importActual) => ({
  ...(await importActual<
    typeof import("../../src/store/revision-transport-service")
  >()),
  removeRevision: vi.fn(),
}));

import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import { setSelectedResourceId } from "../../src/store/resourcesSlice";
import { removeRevision } from "../../src/store/revision-transport-service";
import { LimitRefusalError } from "../../src/lib/api/limit-refusal";
import {
  deleteRevisionForSelectedResource,
  selectCurrentRevisionContent,
  selectCurrentRevisionId,
  selectDeletingRevisionId,
  selectFetchingRevisionId,
  selectIsLoadingRevisions,
  selectIsSavingRevision,
  selectRevisionsErrorMessage,
  selectVisibleRevisions,
  type RevisionEntry,
  type RevisionsState,
} from "../../src/store/revisionsSlice";
import type { RootState } from "../../src/store/store";
import { initialUserWordListState } from "../../src/store/userWordListSlice";

function createRevisionEntry(overrides: Partial<RevisionEntry>): RevisionEntry {
  const versionNumber = overrides.versionNumber ?? 1;
  const resourceId = overrides.resourceId ?? "resource-1";
  const revisionId = overrides.id ?? `revision-${versionNumber}`;

  return {
    id: revisionId,
    resourceId,
    versionNumber,
    createdAt: `2026-03-21T12:00:0${versionNumber}.000Z`,
    isCanonical: versionNumber === 1,
    displayName: `Revision v${versionNumber}`,
    isProtected: false,
    ...overrides,
  };
}

function createRootState(overrides?: {
  revisions?: Partial<RevisionsState>;
  selectedResourceId?: string | null;
}): RootState {
  return {
    projects: {
      selectedProjectId: "project-1",
      projects: {
        "project-1": {
          id: "project-1",
          name: "Project One",
          rootPath: "/tmp/project-1",
          folders: [],
          resources: [],
        },
      },
    },
    resources: {
      selectedResourceId: overrides?.selectedResourceId ?? "resource-1",
      resources: [],
      folders: [],
      suppressNextViewAutoSwitch: false,
    },
    revisions: {
      resourceId: "resource-1",
      requestedResourceId: null,
      currentRevisionId: "revision-2",
      currentRevisionContent: "Rendered preview",
      revisions: [
        createRevisionEntry({ id: "revision-2", versionNumber: 2 }),
        createRevisionEntry({ id: "revision-1", versionNumber: 1 }),
      ],
      isLoading: true,
      isSaving: false,
      fetchingRevisionId: "revision-2",
      deletingRevisionId: "revision-1",
      errorMessage: "warning",
      ...overrides?.revisions,
    },
    editorConfig: { headings: {} },
    search: {
      requestedProjectId: null,
      requestedQuery: "",
      results: [],
      isLoading: false,
      errorMessage: "",
    },
    queries: {
      projectId: null,
      requestedProjectId: null,
      savedQueries: {},
      isLoadingQueries: false,
      isEvaluating: false,
      evaluatingForProjectId: null,
      activeQueryDefinition: null,
      activeQueryIds: [],
      savingQueryId: null,
      deletingQueryId: null,
      errorMessage: "",
    },
    crypto: {
      status: "absent",
      encryptedProjectIds: [],
      isUnlocking: false,
      isConverting: false,
      isExporting: false,
      errorMessage: "",
    },
    entityAliasTable: {
      projectId: null,
      table: { entities: {}, claimedBy: {} },
      status: "idle",
    },
    spelling: {
      projectId: null,
      requestedProjectId: null,
      status: "not-loaded",
      lists: { spellingProjectWords: [], spellingIgnoredWords: [] },
      errorMessage: "",
      aliasTableStatus: "not-loaded",
      aliasTable: null,
      aliasTableErrorMessage: "",
    },
    spellingAvailability: {
      engineFailure: null,
      unsupportedBrowser: null,
      userListApplies: false,
      userListOverride: false,
    },
    userWordList: initialUserWordListState,
  } as RootState;
}

describe("store/revisionsSlice selectors (T008)", () => {
  it("returns visible revisions only when the selected resource matches the loaded revision state", () => {
    const matchingState = createRootState();
    const visible = selectVisibleRevisions(matchingState);

    expect(visible.map((revision) => revision.id)).toEqual([
      "revision-2",
      "revision-1",
    ]);
    expect(selectVisibleRevisions(matchingState)).toBe(visible);

    const staleState = createRootState({ selectedResourceId: "resource-9" });
    expect(selectVisibleRevisions(staleState)).toEqual([]);
  });

  it("exposes the current revision and status flags through stable selectors", () => {
    const state = createRootState();

    expect(selectCurrentRevisionId(state)).toBe("revision-2");
    expect(selectCurrentRevisionContent(state)).toBe("Rendered preview");
    expect(selectIsLoadingRevisions(state)).toBe(true);
    expect(selectIsSavingRevision(state)).toBe(false);
    expect(selectFetchingRevisionId(state)).toBe("revision-2");
    expect(selectDeletingRevisionId(state)).toBe("revision-1");
    expect(selectRevisionsErrorMessage(state)).toBe("warning");
  });
});

describe("deleteRevisionForSelectedResource rejection (Feature 77 Task 22)", () => {
  function storeWithProject() {
    const store = makeStore();
    store.dispatch(
      setProject({
        id: "project-1",
        name: "P",
        rootPath: "/tmp/project-1",
        folders: [],
        resources: [],
      } as never),
    );
    store.dispatch(setSelectedProjectId("project-1"));
    store.dispatch(setSelectedResourceId("resource-1"));
    return store;
  }

  it("flags a limit refusal in the rejected action's meta, keeps the server text as payload, and leaves errorMessage empty", async () => {
    vi.mocked(removeRevision).mockRejectedValue(
      new LimitRefusalError("Not from here.", "permanentDeletion"),
    );
    const store = storeWithProject();
    const result = await store.dispatch(
      deleteRevisionForSelectedResource({
        resourceId: "resource-1",
        revisionId: "revision-1",
      }),
    );
    expect(deleteRevisionForSelectedResource.rejected.match(result)).toBe(true);
    if (!deleteRevisionForSelectedResource.rejected.match(result)) return;
    expect(result.payload).toBe("Not from here.");
    expect(result.meta.limitRefusal).toBe(true);
    expect(selectRevisionsErrorMessage(store.getState())).toBe("");
  });

  it("does not flag an ordinary failure, and records it in errorMessage", async () => {
    vi.mocked(removeRevision).mockRejectedValue(new Error("disk full"));
    const store = storeWithProject();
    const result = await store.dispatch(
      deleteRevisionForSelectedResource({
        resourceId: "resource-1",
        revisionId: "revision-1",
      }),
    );
    if (!deleteRevisionForSelectedResource.rejected.match(result))
      throw new Error("expected rejection");
    expect(result.meta.limitRefusal).toBeUndefined();
    expect(selectRevisionsErrorMessage(store.getState())).toBe("disk full");
  });
});
