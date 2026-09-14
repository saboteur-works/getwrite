/**
 * Component tests for `TrashView` (trash-ui Task 15 + Task 17) — the Trash
 * tab's read-only listing (fetching `listTrash`, rendering trashed resources
 * and top-level trashed folders as top-level rows, a trashed folder's former
 * contents nested inside it read-only (resolved OQ-3/FR-4), and the FR-1
 * empty state) plus Task 17's multi-select restore/purge/"Empty trash"
 * batch controls, `ConfirmDialog` confirmation, and per-item batch report
 * (FR-2, FR-13, FR-21).
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { Provider } from "react-redux";
import TrashView from "../../components/WorkArea/Views/TrashView/TrashView";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import {
  loadResources,
  setSelectedResourceId,
} from "../../src/store/resourcesSlice";
import type { TrashListing } from "../../src/lib/api/trash";
import type { ProjectApiEntry } from "../../src/lib/api/projects";

vi.mock("../../src/lib/api/trash", () => ({
  listTrash: vi.fn(),
  restoreTrashItems: vi.fn(),
  purgeTrashItems: vi.fn(),
}));

// Task 22 (Finding 1): mocked so the restore-refetch path
// (`TrashView.tsx`'s `confirmPendingAction`, restore branch) can be driven
// without a real `/api/project` round trip.
vi.mock("../../src/lib/api/projects", () => ({
  openProject: vi.fn(),
  // `AppShell` (via `SearchBar`) fires a best-effort reindex on mount for
  // whichever project is active — unrelated to this suite, but needs a
  // resolved mock now that this module is mocked at all.
  reindexProject: vi.fn().mockResolvedValue(undefined),
}));

// AppShell's default "edit" view mounts the real TipTap editor for a text
// resource; the FR-21/Task 17 test below only needs the fallback branch, so
// this avoids loading TipTap in jsdom (mirrors
// tests/appShellEntityRosterGating.test.tsx's own setup).
vi.mock("../../components/TipTapEditor", () => ({
  __esModule: true,
  default: () => <textarea data-testid="tiptap-mock" />,
}));

import {
  listTrash,
  purgeTrashItems,
  restoreTrashItems,
} from "../../src/lib/api/trash";
import { openProject } from "../../src/lib/api/projects";
import AppShell from "../../components/Layout/AppShell";

const mockedListTrash = vi.mocked(listTrash);
const mockedRestoreTrashItems = vi.mocked(restoreTrashItems);
const mockedPurgeTrashItems = vi.mocked(purgeTrashItems);
const mockedOpenProject = vi.mocked(openProject);

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

/** Selects a top-level trash row's checkbox by its `data-trash-id`. */
function selectTrashRow(id: string) {
  const row = screen
    .getAllByTestId("trash-row")
    .find((r: HTMLElement) => r.getAttribute("data-trash-id") === id);
  if (!row) throw new Error(`No trash-row found for id ${id}`);
  const checkbox = within(row).getByTestId("trash-row-select");
  fireEvent.click(checkbox);
}

const THREE_RESOURCE_LISTING: TrashListing = {
  resources: [
    {
      id: "res-1",
      originalName: "Resource One",
      resourceType: "text",
      originalParentId: null,
      deletedAt: "2026-09-01T00:00:00.000Z",
    },
    {
      id: "res-2",
      originalName: "Resource Two",
      resourceType: "text",
      originalParentId: null,
      deletedAt: "2026-09-01T00:00:00.000Z",
    },
    {
      id: "res-3",
      originalName: "Resource Three",
      resourceType: "text",
      originalParentId: null,
      deletedAt: "2026-09-01T00:00:00.000Z",
    },
  ],
  folders: [],
};

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  // AppShell's mount effects fire a few background fetches (saved queries,
  // reindex, etc.) that are irrelevant to the FR-21 test below and whose
  // relative URLs `node-fetch`/undici can't parse outside a browser — stub
  // fetch globally so those settle quietly instead of surfacing as unhandled
  // rejections (mirrors tests/appShellEntityRosterGating.test.tsx's setup).
  originalFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => "",
  })) as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
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

describe("TrashView — batch restore/purge/Empty trash controls (Task 17)", () => {
  it("restores exactly the two selected resources in one restoreTrashItems call, not one per item", async () => {
    mockedListTrash.mockResolvedValue(THREE_RESOURCE_LISTING);
    mockedRestoreTrashItems.mockResolvedValue([
      { id: "res-1", ok: true },
      { id: "res-2", ok: true },
    ]);

    const store = setupStore();

    render(
      <Provider store={store}>
        <TrashView />
      </Provider>,
    );

    await screen.findAllByTestId("trash-row");

    selectTrashRow("res-1");
    selectTrashRow("res-2");

    fireEvent.click(screen.getByTestId("trash-restore-selected"));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Restore" }));

    await waitFor(() =>
      expect(mockedRestoreTrashItems).toHaveBeenCalledTimes(1),
    );
    const [calledProjectId, calledIds] = mockedRestoreTrashItems.mock.calls[0];
    expect(calledProjectId).toBe(PROJECT_ID);
    expect([...calledIds].sort()).toEqual(["res-1", "res-2"]);

    // Restored items disappear from the Trash listing; the untouched third
    // resource remains.
    await waitFor(() =>
      expect(screen.queryAllByTestId("trash-row")).toHaveLength(1),
    );
    expect(screen.getByTestId("trash-row").getAttribute("data-trash-id")).toBe(
      "res-3",
    );
    expect(screen.getByTestId("trash-batch-report").textContent).toMatch(
      /2 of 2 restored/i,
    );
  });

  it("empties the whole Trash by calling purgeTrashItems with every currently-listed id, once", async () => {
    mockedListTrash.mockResolvedValue(THREE_RESOURCE_LISTING);
    mockedPurgeTrashItems.mockResolvedValue([
      { id: "res-1", ok: true },
      { id: "res-2", ok: true },
      { id: "res-3", ok: true },
    ]);

    const store = setupStore();

    render(
      <Provider store={store}>
        <TrashView />
      </Provider>,
    );

    await screen.findAllByTestId("trash-row");

    fireEvent.click(screen.getByTestId("trash-empty-trash"));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete permanently" }),
    );

    await waitFor(() => expect(mockedPurgeTrashItems).toHaveBeenCalledTimes(1));
    const [calledProjectId, calledIds] = mockedPurgeTrashItems.mock.calls[0];
    expect(calledProjectId).toBe(PROJECT_ID);
    expect([...(calledIds as string[])].sort()).toEqual([
      "res-1",
      "res-2",
      "res-3",
    ]);

    await waitFor(() =>
      expect(screen.getByTestId("trash-empty-state")).toBeTruthy(),
    );
  });

  it("reports a partial batch failure and leaves the failed item listed in Trash", async () => {
    mockedListTrash.mockResolvedValue(THREE_RESOURCE_LISTING);
    mockedPurgeTrashItems.mockResolvedValue([
      { id: "res-1", ok: true },
      { id: "res-2", ok: false, error: "locked" },
    ]);

    const store = setupStore();

    render(
      <Provider store={store}>
        <TrashView />
      </Provider>,
    );

    await screen.findAllByTestId("trash-row");

    selectTrashRow("res-1");
    selectTrashRow("res-2");

    fireEvent.click(screen.getByTestId("trash-delete-selected"));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete permanently" }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("trash-batch-report").textContent).toMatch(
        /1 of 2 permanently deleted; 1 failed/i,
      ),
    );

    // The failed item (res-2) is still listed; the succeeded one (res-1) and
    // the untouched one (res-3) round out the remaining rows.
    const remainingIds = screen
      .getAllByTestId("trash-row")
      .map((row: HTMLElement) => row.getAttribute("data-trash-id"))
      .sort();
    expect(remainingIds).toEqual(["res-2", "res-3"]);
  });
});

describe("TrashView — Task 18 per-item restore notices (FR-5/FR-9/FR-14)", () => {
  it("renders a distinct notice when a restored item was relocated to the project root", async () => {
    mockedListTrash.mockResolvedValue(THREE_RESOURCE_LISTING);
    mockedRestoreTrashItems.mockResolvedValue([
      { id: "res-1", ok: true, relocated: true, renamed: false },
    ]);

    const store = setupStore();

    render(
      <Provider store={store}>
        <TrashView />
      </Provider>,
    );

    await screen.findAllByTestId("trash-row");
    selectTrashRow("res-1");
    fireEvent.click(screen.getByTestId("trash-restore-selected"));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Restore" }));

    await waitFor(() => {
      const notices = screen.getAllByTestId("trash-restore-notice");
      expect(notices).toHaveLength(1);
      expect(notices[0].textContent).toMatch(
        /moved to project root because its original folder no longer exists/i,
      );
    });

    // Distinct from (and in addition to) the generic batch count.
    expect(screen.getByTestId("trash-batch-report").textContent).toMatch(
      /1 of 1 restored/i,
    );
  });

  it("renders a distinct notice naming the ' (restored)' name when a restored item was renamed on collision", async () => {
    mockedListTrash.mockResolvedValue(THREE_RESOURCE_LISTING);
    mockedRestoreTrashItems.mockResolvedValue([
      { id: "res-1", ok: true, relocated: false, renamed: true },
    ]);

    const store = setupStore();

    render(
      <Provider store={store}>
        <TrashView />
      </Provider>,
    );

    await screen.findAllByTestId("trash-row");
    selectTrashRow("res-1");
    fireEvent.click(screen.getByTestId("trash-restore-selected"));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Restore" }));

    await waitFor(() => {
      const notices = screen.getAllByTestId("trash-restore-notice");
      expect(notices).toHaveLength(1);
      expect(notices[0].textContent).toContain("Resource One (restored)");
      expect(notices[0].textContent).toMatch(/already has that name/i);
    });
  });

  it("renders a distinct notice naming which references couldn't be restored", async () => {
    mockedListTrash.mockResolvedValue(THREE_RESOURCE_LISTING);
    mockedRestoreTrashItems.mockResolvedValue([
      {
        id: "res-1",
        ok: true,
        relocated: false,
        renamed: false,
        referencesNotRestored: [
          { referencingResourceId: "res-9", fieldKey: "relatedTo" },
        ],
      },
    ]);

    const store = setupStore();

    render(
      <Provider store={store}>
        <TrashView />
      </Provider>,
    );

    await screen.findAllByTestId("trash-row");
    selectTrashRow("res-1");
    fireEvent.click(screen.getByTestId("trash-restore-selected"));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Restore" }));

    await waitFor(() => {
      const notices = screen.getAllByTestId("trash-restore-notice");
      expect(notices).toHaveLength(1);
      expect(notices[0].textContent).toMatch(
        /could not be restored automatically/i,
      );
      expect(notices[0].textContent).toContain("relatedTo");
      expect(notices[0].textContent).toContain("res-9");
    });
  });

  it("renders no restore notices for a plain restore with no relocation/rename/reference issues", async () => {
    mockedListTrash.mockResolvedValue(THREE_RESOURCE_LISTING);
    mockedRestoreTrashItems.mockResolvedValue([
      { id: "res-1", ok: true, relocated: false, renamed: false },
    ]);

    const store = setupStore();

    render(
      <Provider store={store}>
        <TrashView />
      </Provider>,
    );

    await screen.findAllByTestId("trash-row");
    selectTrashRow("res-1");
    fireEvent.click(screen.getByTestId("trash-restore-selected"));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Restore" }));

    await waitFor(() =>
      expect(screen.getByTestId("trash-batch-report").textContent).toMatch(
        /1 of 1 restored/i,
      ),
    );
    expect(screen.queryByTestId("trash-restore-notice")).toBeNull();
  });
});

describe("TrashView + AppShell — FR-21 open-editor-tab boundary (Task 17)", () => {
  /**
   * FR-21/OQ-11: no new open-editor-tab behavior is added for a resource
   * deleted/purged from `TrashView`.
   *
   * NOTE on the literal "Resource not found." text: `AppShell.tsx`'s
   * `!selectedResource` guard that renders that exact string (`:1453-1463`)
   * sits behind an outer gate (`:1299-1303`) that requires `selectedResource`
   * to already be truthy — or `view` to be one of the project-wide views
   * (`data`/`entityRoster`/`entityGraph`/`trash`), each of which returns its
   * own content before that guard is ever reached. Measured directly against
   * this worktree's `AppShell.tsx` (a small standalone probe rendering
   * `AppShell` on the default "edit" view, selecting a resource, then
   * dispatching the exact `removeResource` action `AppShell.tsx`'s own
   * `onDeleteConfirm` handler dispatches at `:1125-1131`): the rendered
   * output is the "Select a file from the resource tree, or create a new
   * resource to continue." welcome content, not "Resource not found." — so
   * that text is not reachable via any state this suite can drive `AppShell`
   * into today. This is a pre-existing property of `AppShell.tsx`, out of
   * this task's file scope (`TrashView.tsx` and this test file only), so it
   * is not changed here. This test instead verifies what FR-21 actually
   * requires of `TrashView`: that purging a resource whose id is still the
   * active `selectedResourceId` changes nothing else about that selection
   * state, and that `TrashView` renders no UI of its own beyond its batch
   * report for that case.
   */
  it("purging a resource that is still the active selection touches only TrashView's own batch report — resourcesSlice selection state is untouched", async () => {
    const STALE_ID = "stale-open-resource";
    mockedListTrash.mockResolvedValue({
      resources: [
        {
          id: STALE_ID,
          originalName: "Stale Open Resource",
          resourceType: "text",
          originalParentId: null,
          deletedAt: "2026-09-01T00:00:00.000Z",
        },
      ],
      folders: [],
    });
    mockedPurgeTrashItems.mockResolvedValue([{ id: STALE_ID, ok: true }]);

    const project = {
      id: PROJECT_ID,
      name: "Trash View Project",
      rootPath: `/tmp/${PROJECT_ID}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const store = makeStore();
    store.dispatch(
      setProject({
        id: PROJECT_ID,
        name: project.name,
        rootPath: project.rootPath,
        folders: [],
        resources: [],
      } as never),
    );
    store.dispatch(setSelectedProjectId(PROJECT_ID));
    // resourcesSlice never gets this id — mirroring a resource that was
    // already soft-deleted (and so already removed) while its editor tab
    // stayed selected. Nothing here is Trash-specific yet.
    store.dispatch(setSelectedResourceId(STALE_ID));

    // Baseline: AppShell's own existing fallback for a stale/absent
    // selection, entirely unrelated to Trash.
    const baseline = render(
      <Provider store={store}>
        <AppShell
          showSidebars={true}
          project={project as never}
          resources={[]}
        />
      </Provider>,
    );
    const baselineText = screen.getByText(
      /Select a file from the resource tree/i,
    ).textContent;
    baseline.unmount();

    // Purge the same id via TrashView alone, against the same store.
    render(
      <Provider store={store}>
        <TrashView />
      </Provider>,
    );
    await screen.findAllByTestId("trash-row");
    selectTrashRow(STALE_ID);
    fireEvent.click(screen.getByTestId("trash-delete-selected"));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete permanently" }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("trash-batch-report").textContent).toMatch(
        /1 of 1 permanently deleted/i,
      ),
    );

    // The purge left `selectedResourceId` exactly as it was — TrashView
    // dispatches nothing to resourcesSlice — so the stale selection is
    // still unresolved and still absent from resourcesSlice afterward.
    expect(store.getState().resources.selectedResourceId).toBe(STALE_ID);
    expect(
      store.getState().resources.resources.some((r) => r.id === STALE_ID),
    ).toBe(false);

    // Re-mounting AppShell against the same, now-post-purge store resolves
    // to the byte-identical fallback content — proving the purge added no
    // new open-editor-tab behavior of its own (FR-21).
    render(
      <Provider store={store}>
        <AppShell
          showSidebars={true}
          project={project as never}
          resources={[]}
        />
      </Provider>,
    );
    expect(
      screen.getByText(/Select a file from the resource tree/i).textContent,
    ).toBe(baselineText);
  });
});

describe("TrashView — Task 22 (Finding 1): resourcesSlice refresh after restore", () => {
  it("adds the restored resource to resourcesSlice without a reload", async () => {
    mockedListTrash.mockResolvedValue({
      resources: [
        {
          id: "res-restored",
          originalName: "Restored Resource",
          resourceType: "text",
          originalParentId: null,
          deletedAt: "2026-09-01T00:00:00.000Z",
        },
      ],
      folders: [],
    });
    mockedRestoreTrashItems.mockResolvedValue([
      { id: "res-restored", ok: true },
    ]);

    const existingResource = {
      id: "res-existing",
      slug: "res-existing",
      name: "Existing Resource",
      type: "text",
      orderIndex: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const restoredResource = {
      ...existingResource,
      id: "res-restored",
      slug: "res-restored",
      name: "Restored Resource",
    };

    const openedProject: ProjectApiEntry = {
      project: {
        id: PROJECT_ID,
        name: "Trash View Project",
        rootPath: `/tmp/${PROJECT_ID}`,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      } as never,
      folders: [],
      resources: [existingResource, restoredResource] as never,
    };
    mockedOpenProject.mockResolvedValue(openedProject);

    const store = setupStore();
    store.dispatch(
      loadResources({
        resources: [existingResource] as never,
        projectId: PROJECT_ID,
      }),
    );

    render(
      <Provider store={store}>
        <TrashView />
      </Provider>,
    );

    await screen.findAllByTestId("trash-row");

    // Before the fix, `resourcesSlice`'s `resources` array would still be
    // exactly `[existingResource]` here — `confirmPendingAction`'s success
    // branch only updated this component's own local `resources`/`folders`
    // state (the Trash listing), never `resourcesSlice`.
    expect(store.getState().resources.resources).toHaveLength(1);

    selectTrashRow("res-restored");
    fireEvent.click(screen.getByTestId("trash-restore-selected"));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Restore" }));

    await waitFor(() =>
      expect(mockedOpenProject).toHaveBeenCalledWith(PROJECT_ID),
    );

    await waitFor(() => {
      const ids = store
        .getState()
        .resources.resources.map((r) => r.id)
        .sort();
      expect(ids).toEqual(["res-existing", "res-restored"]);
    });
  });

  it("adds a restored folder and its two nested descendant resources to resourcesSlice", async () => {
    mockedListTrash.mockResolvedValue({
      resources: [],
      folders: [
        {
          id: "folder-restored",
          originalName: "Restored Folder",
          originalParentId: null,
          deletedAt: "2026-09-01T00:00:00.000Z",
          descendants: [
            {
              id: "child-res-1",
              kind: "resource",
              parentId: "folder-restored",
              orderIndex: 0,
            },
            {
              id: "child-res-2",
              kind: "resource",
              parentId: "folder-restored",
              orderIndex: 1,
            },
          ],
        },
      ],
    });
    mockedRestoreTrashItems.mockResolvedValue([
      { id: "folder-restored", ok: true },
    ]);

    const restoredFolder = {
      id: "folder-restored",
      slug: "folder-restored",
      name: "Restored Folder",
      type: "folder",
      orderIndex: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const childOne = {
      id: "child-res-1",
      slug: "child-res-1",
      name: "Child One",
      type: "text",
      orderIndex: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      folderId: "folder-restored",
    };
    const childTwo = {
      id: "child-res-2",
      slug: "child-res-2",
      name: "Child Two",
      type: "text",
      orderIndex: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      folderId: "folder-restored",
    };

    const openedProject: ProjectApiEntry = {
      project: {
        id: PROJECT_ID,
        name: "Trash View Project",
        rootPath: `/tmp/${PROJECT_ID}`,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      } as never,
      folders: [restoredFolder] as never,
      resources: [childOne, childTwo] as never,
    };
    mockedOpenProject.mockResolvedValue(openedProject);

    const store = setupStore();

    render(
      <Provider store={store}>
        <TrashView />
      </Provider>,
    );

    await screen.findAllByTestId("trash-row");

    selectTrashRow("folder-restored");
    fireEvent.click(screen.getByTestId("trash-restore-selected"));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Restore" }));

    await waitFor(() =>
      expect(mockedOpenProject).toHaveBeenCalledWith(PROJECT_ID),
    );

    await waitFor(() => {
      const resourceIds = store
        .getState()
        .resources.resources.map((r) => r.id)
        .sort();
      expect(resourceIds).toEqual(["child-res-1", "child-res-2"]);
      const folderIds = store.getState().resources.folders.map((f) => f.id);
      expect(folderIds).toEqual(["folder-restored"]);
    });
  });
});
