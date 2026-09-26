import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Revision } from "../../src/lib/models/types";
import {
  parseRevisionEntries,
  toRevisionEntry,
} from "../../src/store/revision-normalization";

vi.mock(
  "../../src/store/revision-transport-service",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../src/store/revision-transport-service")
      >();
    return {
      ...actual,
      persistRevisionPreserve: vi.fn(),
      removeRevision: vi.fn(),
    };
  },
);

import {
  persistRevisionPreserve,
  removeRevision,
} from "../../src/store/revision-transport-service";
import type { AppDispatch, RootState } from "../../src/store/store";
import projectsReducer from "../../src/store/projectsSlice";
import resourcesReducer from "../../src/store/resourcesSlice";
import revisionsReducer, {
  deleteRevisionForSelectedResource,
  setRevisionPreserveForSelectedResource,
  type RevisionEntry,
} from "../../src/store/revisionsSlice";

const PROTECTED_MESSAGE =
  "Protected revisions cannot be deleted. Unprotect it first.";

function makeRevision(n: number, metadata?: Revision["metadata"]): Revision {
  return {
    id: `rev-${n}`,
    resourceId: "resource-1",
    versionNumber: n,
    createdAt: `2026-03-21T12:00:0${n}.000Z`,
    filePath: `/tmp/rev-${n}.json`,
    isCanonical: n === 1,
    ...(metadata ? { metadata } : {}),
  };
}

function makeStore(revisions: RevisionEntry[]): {
  dispatch: AppDispatch;
  getState: () => RootState;
} {
  const reducer = combineReducers({
    projects: projectsReducer,
    resources: resourcesReducer,
    revisions: revisionsReducer,
  });
  const store = configureStore({
    reducer,
    preloadedState: {
      projects: {
        selectedProjectId: "project-1",
        projects: {
          "project-1": {
            id: "project-1",
            name: "P",
            rootPath: "/tmp/project-1",
            folders: [],
            resources: [],
          },
        },
      },
      resources: {
        selectedResourceId: "resource-1",
        resources: [],
        folders: [],
      },
      revisions: {
        resourceId: "resource-1",
        requestedResourceId: null,
        currentRevisionId: "rev-1",
        currentRevisionContent: null,
        revisions,
        isLoading: false,
        isSaving: false,
        fetchingRevisionId: null,
        deletingRevisionId: null,
        errorMessage: "",
      },
    } as unknown as ReturnType<typeof reducer>,
  });
  return {
    dispatch: store.dispatch as unknown as AppDispatch,
    getState: store.getState as unknown as () => RootState,
  };
}

describe("revision normalization isProtected", () => {
  it("is true for truthy metadata.preserve and false otherwise", () => {
    expect(
      toRevisionEntry(makeRevision(1, { preserve: true })).isProtected,
    ).toBe(true);
    expect(
      toRevisionEntry(makeRevision(2, { preserve: false })).isProtected,
    ).toBe(false);
    expect(toRevisionEntry(makeRevision(3, { name: "x" })).isProtected).toBe(
      false,
    );
    expect(toRevisionEntry(makeRevision(4)).isProtected).toBe(false);
  });

  it("does not alter displayName", () => {
    const entry = toRevisionEntry(
      makeRevision(2, { preserve: true, name: "Draft" }),
    );
    expect(entry.displayName).toBe("Draft");
    expect(
      toRevisionEntry(makeRevision(3, { preserve: true })).displayName,
    ).toBe("Revision v3");
  });

  it("is set by parseRevisionEntries", () => {
    const entries = parseRevisionEntries([
      makeRevision(1, { preserve: true }),
      makeRevision(2),
    ]);
    expect(entries.map((e) => [e.id, e.isProtected])).toEqual([
      ["rev-2", false],
      ["rev-1", true],
    ]);
  });
});

describe("setRevisionPreserveForSelectedResource", () => {
  beforeEach(() => vi.resetAllMocks());

  it("updates only the matching entry on success", async () => {
    const store = makeStore([
      toRevisionEntry(makeRevision(2)),
      toRevisionEntry(makeRevision(1)),
    ]);
    vi.mocked(persistRevisionPreserve).mockResolvedValue(
      makeRevision(2, { preserve: true }),
    );
    await store.dispatch(
      setRevisionPreserveForSelectedResource({
        resourceId: "resource-1",
        revisionId: "rev-2",
        preserve: true,
      }),
    );
    expect(persistRevisionPreserve).toHaveBeenCalledWith(
      { projectId: "project-1", resourceId: "resource-1" },
      "rev-2",
      true,
    );
    const revs = store.getState().revisions.revisions;
    expect(revs.find((r) => r.id === "rev-2")?.isProtected).toBe(true);
    expect(revs.find((r) => r.id === "rev-1")?.isProtected).toBe(false);
  });

  it("unprotects on preserve false", async () => {
    const store = makeStore([
      toRevisionEntry(makeRevision(2, { preserve: true })),
    ]);
    vi.mocked(persistRevisionPreserve).mockResolvedValue(
      makeRevision(2, { preserve: false }),
    );
    await store.dispatch(
      setRevisionPreserveForSelectedResource({
        resourceId: "resource-1",
        revisionId: "rev-2",
        preserve: false,
      }),
    );
    expect(store.getState().revisions.revisions[0].isProtected).toBe(false);
  });

  it("leaves state unchanged and surfaces the error on rejection", async () => {
    const initial = [toRevisionEntry(makeRevision(2))];
    const store = makeStore(initial);
    vi.mocked(persistRevisionPreserve).mockRejectedValue(new Error("boom"));
    const result = await store.dispatch(
      setRevisionPreserveForSelectedResource({
        resourceId: "resource-1",
        revisionId: "rev-2",
        preserve: true,
      }),
    );
    expect(result.type).toMatch(/rejected$/);
    expect(store.getState().revisions.revisions).toEqual(initial);
    expect(store.getState().revisions.errorMessage).toBe("boom");
  });
});

describe("deleteRevisionForSelectedResource protected refusal", () => {
  beforeEach(() => vi.resetAllMocks());

  it("carries the protected-delete message unchanged", async () => {
    const initial = [toRevisionEntry(makeRevision(2, { preserve: true }))];
    const store = makeStore(initial);
    vi.mocked(removeRevision).mockRejectedValue(new Error(PROTECTED_MESSAGE));
    const result = await store.dispatch(
      deleteRevisionForSelectedResource({
        resourceId: "resource-1",
        revisionId: "rev-2",
      }),
    );
    expect(result.payload).toBe(PROTECTED_MESSAGE);
    expect(store.getState().revisions.errorMessage).toBe(PROTECTED_MESSAGE);
    expect(store.getState().revisions.revisions).toEqual(initial);
  });
});
