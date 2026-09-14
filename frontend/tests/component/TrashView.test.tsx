/**
 * Component tests for `TrashView` (trash-ui Task 15) — the Trash tab's
 * read-only listing half: fetching `listTrash`, rendering trashed resources
 * and top-level trashed folders as top-level rows, a trashed folder's former
 * contents nested inside it read-only (resolved OQ-3/FR-4), and the FR-1
 * empty state.
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import TrashView from "../../components/WorkArea/Views/TrashView/TrashView";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import type { TrashListing } from "../../src/lib/api/trash";

vi.mock("../../src/lib/api/trash", () => ({ listTrash: vi.fn() }));

import { listTrash } from "../../src/lib/api/trash";

const mockedListTrash = vi.mocked(listTrash);

const PROJECT_ID = "proj-trash-view";

function setupStore() {
  const store = makeStore();
  store.dispatch(
    setProject({
      id: PROJECT_ID,
      name: "Trash View Project",
      rootPath: `/tmp/${PROJECT_ID}`,
      folders: [],
      resources: [],
    } as never),
  );
  store.dispatch(setSelectedProjectId(PROJECT_ID));
  return store;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TrashView", () => {
  it("renders a standalone trashed resource and a trashed folder as distinct, actionable-ready top-level rows, with nested children rendered read-only", async () => {
    const listing: TrashListing = {
      resources: [
        {
          id: "res-1",
          originalName: "Standalone Resource",
          resourceType: "text",
          originalParentId: null,
          deletedAt: "2026-09-01T00:00:00.000Z",
        },
      ],
      folders: [
        {
          id: "folder-1",
          originalName: "Trashed Folder",
          originalParentId: null,
          deletedAt: "2026-09-01T00:00:00.000Z",
          descendants: [
            {
              id: "child-1",
              kind: "resource",
              parentId: "folder-1",
              orderIndex: 0,
            },
            {
              id: "child-2",
              kind: "folder",
              parentId: "folder-1",
              orderIndex: 1,
            },
          ],
        },
      ],
    };
    mockedListTrash.mockResolvedValue(listing);

    const store = setupStore();

    render(
      <Provider store={store}>
        <TrashView />
      </Provider>,
    );

    await waitFor(() =>
      expect(mockedListTrash).toHaveBeenCalledWith(PROJECT_ID),
    );

    // Both top-level items render as their own row.
    const topLevelRows = await screen.findAllByTestId("trash-row");
    expect(topLevelRows).toHaveLength(2);

    const resourceRow = topLevelRows.find(
      (row: HTMLElement) => row.getAttribute("data-trash-id") === "res-1",
    );
    const folderRow = topLevelRows.find(
      (row: HTMLElement) => row.getAttribute("data-trash-id") === "folder-1",
    );
    expect(resourceRow).toBeTruthy();
    expect(folderRow).toBeTruthy();

    // Each top-level row carries its own (currently empty) actions slot,
    // ready for Task 17 to add restore/purge controls into.
    expect(
      resourceRow!.querySelector('[data-testid="trash-row-actions"]'),
    ).toBeTruthy();
    expect(
      folderRow!.querySelector('[data-testid="trash-row-actions"]'),
    ).toBeTruthy();

    // The folder's two descendants render nested inside its row, but with
    // no actions slot of their own — structurally non-actionable.
    const nestedRows = screen.getAllByTestId("trash-nested-row");
    expect(nestedRows).toHaveLength(2);
    nestedRows.forEach((row: HTMLElement) => {
      expect(folderRow!.contains(row)).toBe(true);
      expect(row.querySelector('[data-testid="trash-row-actions"]')).toBeNull();
    });
    // Nested rows are not present as their own top-level `trash-row`.
    expect(
      topLevelRows.some(
        (row: HTMLElement) => row.getAttribute("data-trash-id") === "child-1",
      ),
    ).toBe(false);
  });

  it("renders a distinct 'Trash is empty' message rather than a blank list when nothing is trashed", async () => {
    mockedListTrash.mockResolvedValue({ resources: [], folders: [] });

    const store = setupStore();

    render(
      <Provider store={store}>
        <TrashView />
      </Provider>,
    );

    expect(await screen.findByTestId("trash-empty-state")).toBeTruthy();
    expect(screen.getByText(/trash is empty/i)).toBeTruthy();
    expect(screen.queryByTestId("trash-list")).toBeNull();
    expect(screen.queryAllByTestId("trash-row")).toHaveLength(0);
  });

  it("surfaces a distinct error state rather than the empty state when listTrash rejects", async () => {
    mockedListTrash.mockRejectedValue(new Error("network down"));

    const store = setupStore();

    render(
      <Provider store={store}>
        <TrashView />
      </Provider>,
    );

    expect(await screen.findByTestId("trash-error")).toBeTruthy();
    expect(screen.queryByTestId("trash-empty-state")).toBeNull();
  });
});
