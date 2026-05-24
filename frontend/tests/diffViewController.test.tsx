import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import DiffViewController from "../components/WorkArea/DiffViewController";
import projectsReducer, {
  type StoredProject,
} from "../src/store/projectsSlice";
import resourcesReducer from "../src/store/resourcesSlice";
import revisionsReducer from "../src/store/revisionsSlice";
import editorConfigReducer from "../src/store/editorConfigSlice";
import searchReducer from "../src/store/searchSlice";
import queryReducer from "../src/store/querySlice";
import type { AnyResource, Folder } from "../src/lib/models";
import type { RevisionEntry } from "../src/store/revisionsSlice";

const PROJECT_ID = "proj-diff";
const PROJECT_ROOT = "/tmp/diff-project";
const RESOURCE_ID = "res-diff";

const X_REVISION_ID = "rev-x";
const Y_REVISION_ID = "rev-y";

const X_CONTENT = "the old canonical body";
const Y_CONTENT = "the brand new canonical body";

const SEED_RESOURCE: AnyResource = {
  id: RESOURCE_ID,
  name: "Draft",
  slug: RESOURCE_ID,
  type: "text",
  folderId: null,
  createdAt: new Date().toISOString(),
  orderIndex: 0,
} as AnyResource;

const SEED_FOLDERS: Folder[] = [];

function makeRevision(
  id: string,
  versionNumber: number,
  isCanonical: boolean,
): RevisionEntry {
  return {
    id,
    resourceId: RESOURCE_ID,
    versionNumber,
    createdAt: new Date(2024, 0, versionNumber).toISOString(),
    filePath: `/tmp/${id}.json`,
    isCanonical,
    displayName: `Revision ${versionNumber}`,
    metadata: {},
  };
}

function makeStore(initialCanonicalRevisionId: string) {
  const revisions = [
    makeRevision(
      X_REVISION_ID,
      1,
      initialCanonicalRevisionId === X_REVISION_ID,
    ),
    makeRevision(
      Y_REVISION_ID,
      2,
      initialCanonicalRevisionId === Y_REVISION_ID,
    ),
  ];

  return configureStore({
    reducer: {
      projects: projectsReducer,
      resources: resourcesReducer,
      revisions: revisionsReducer,
      editorConfig: editorConfigReducer,
      search: searchReducer,
      queries: queryReducer,
    },
    preloadedState: {
      projects: {
        selectedProjectId: PROJECT_ID,
        projects: {
          [PROJECT_ID]: {
            id: PROJECT_ID,
            name: "Diff Project",
            rootPath: PROJECT_ROOT,
            folders: SEED_FOLDERS,
            resources: [SEED_RESOURCE],
          } as StoredProject,
        },
      },
      resources: {
        selectedResourceId: RESOURCE_ID,
        resources: [SEED_RESOURCE],
        folders: SEED_FOLDERS,
      },
      revisions: {
        resourceId: RESOURCE_ID,
        requestedResourceId: null,
        currentRevisionId: null,
        currentRevisionContent: null,
        revisions,
        isLoading: false,
        isSaving: false,
        fetchingRevisionId: null,
        deletingRevisionId: null,
        errorMessage: "",
      },
    },
  });
}

// Track the canonical id the mocked /api/project-resources should report and
// the per-revision-id content the mocked GET endpoint should return.
const mockState: {
  canonicalRevisionId: string;
  revisionContents: Record<string, string>;
} = {
  canonicalRevisionId: X_REVISION_ID,
  revisionContents: { [X_REVISION_ID]: X_CONTENT, [Y_REVISION_ID]: Y_CONTENT },
};

function installFetchMock(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : (input as Request).url;

      if (url.endsWith("/api/project-resources") && init?.method === "POST") {
        const revisions = [
          makeRevision(
            X_REVISION_ID,
            1,
            mockState.canonicalRevisionId === X_REVISION_ID,
          ),
          makeRevision(
            Y_REVISION_ID,
            2,
            mockState.canonicalRevisionId === Y_REVISION_ID,
          ),
        ];
        return new Response(JSON.stringify({ revisions }), { status: 200 });
      }

      if (url.includes(`/api/resource/revision/${RESOURCE_ID}?`)) {
        const params = new URL(url, "http://localhost").searchParams;
        const revisionId = params.get("revisionId") ?? "";
        const content = mockState.revisionContents[revisionId] ?? "";
        return new Response(JSON.stringify({ content }), { status: 200 });
      }

      throw new Error(`Unmocked fetch: ${init?.method ?? "GET"} ${url}`);
    }),
  );
}

describe("DiffViewController", () => {
  beforeEach(() => {
    mockState.canonicalRevisionId = X_REVISION_ID;
    installFetchMock();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refetches canonical content when the canonical revision changes", async () => {
    const store = makeStore(X_REVISION_ID);

    render(
      <Provider store={store}>
        <DiffViewController />
      </Provider>,
    );

    const canonicalPane = await screen.findByLabelText("canonical-pane");

    // First fetch round: canonical pane should display X's content.
    await waitFor(() => {
      expect(canonicalPane.textContent ?? "").toContain(X_CONTENT);
    });

    // Simulate the editor promoting Y to canonical: revisions slice updates
    // its isCanonical flags and the editor's follow-up fetch leaves Y's
    // content in the slice's currentRevisionContent.
    mockState.canonicalRevisionId = Y_REVISION_ID;
    act(() => {
      store.dispatch({
        type: "revisions/setCanonicalRevisionForSelectedResource/fulfilled",
        payload: { resourceId: RESOURCE_ID, revisionId: Y_REVISION_ID },
      });
      store.dispatch({
        type: "revisions/fetchRevisionContentForSelectedResource/fulfilled",
        payload: {
          resourceId: RESOURCE_ID,
          revisionId: Y_REVISION_ID,
          content: Y_CONTENT,
        },
      });
    });

    // Regression: canonical pane should now reflect Y, not the cached X.
    await waitFor(() => {
      expect(canonicalPane.textContent ?? "").toContain(Y_CONTENT);
    });
    expect(canonicalPane.textContent ?? "").not.toContain(X_CONTENT);
  });

  it("does not surface revision content fetched outside DiffView in the historical pane", async () => {
    const store = makeStore(X_REVISION_ID);

    render(
      <Provider store={store}>
        <DiffViewController />
      </Provider>,
    );

    // Wait for the initial canonical load to settle.
    const canonicalPane = await screen.findByLabelText("canonical-pane");
    await waitFor(() => {
      expect(canonicalPane.textContent ?? "").toContain(X_CONTENT);
    });

    // The editor's set-canonical flow leaves Y's content in the slice without
    // DiffView ever asking for it. The historical pane must NOT pick this up.
    act(() => {
      store.dispatch({
        type: "revisions/setCanonicalRevisionForSelectedResource/fulfilled",
        payload: { resourceId: RESOURCE_ID, revisionId: Y_REVISION_ID },
      });
      store.dispatch({
        type: "revisions/fetchRevisionContentForSelectedResource/fulfilled",
        payload: {
          resourceId: RESOURCE_ID,
          revisionId: Y_REVISION_ID,
          content: Y_CONTENT,
        },
      });
    });

    // The historical pane should keep its placeholder — Y belongs in the
    // canonical pane now, not the historical one.
    const historicalPane = await screen.findByLabelText("historical-pane");
    await waitFor(() => {
      expect(historicalPane.textContent ?? "").toContain(
        "Select a revision to compare",
      );
    });
    expect(historicalPane.textContent ?? "").not.toContain(Y_CONTENT);
  });
});
