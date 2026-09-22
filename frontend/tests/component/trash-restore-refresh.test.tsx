import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { makeStore } from "../../src/store/store";
import TrashRefreshProvider, {
  useTrashRefresh,
} from "../../components/Layout/TrashRefreshContext";
import type { Project, Folder, AnyResource } from "../../src/lib/models/types";

/**
 * Regression coverage for the measured defect: `app/(app)/page.tsx`'s
 * `Home` component mirrors the open project into local `useState`
 * (`selectedProject`/`projects`), hydrated once by `handleOpen`. A restore
 * performed from the Trash tab (`TrashView.tsx`) only dispatches to Redux,
 * so that local state went stale — most visibly, `handleResourceAction`'s
 * `"delete"` branch decides folder-vs-resource by reading
 * `selectedProject.folders.find(...)` (`page.tsx:665`), so a folder
 * restored from Trash and deleted again without a reload fell through to
 * the resource-delete path and silently no-op'd on disk.
 *
 * This suite exercises the fix end to end through the real
 * `TrashRefreshContext` (`components/Layout/TrashRefreshContext.tsx`)
 * rather than asserting on the context in isolation, since the context
 * itself carries no data — only `page.tsx`'s reaction to it (re-running the
 * existing `handleOpen` path) is the behaviour worth covering.
 *
 * Mirrors `tests/component/page-delete-failure.test.tsx`'s established
 * technique for reaching `page.tsx`'s otherwise-unexported
 * `handleResourceAction`: `AppShell` is replaced with a minimal test double
 * that captures the resources/folders `page.tsx` passes down and exposes
 * buttons that invoke `onResourceAction` directly.
 */

const deleteResourceMock = vi.fn();
const deleteFolderMock = vi.fn();

vi.mock("../../src/lib/api/resources", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/lib/api/resources")
  >("../../src/lib/api/resources");
  return {
    ...actual,
    deleteResource: (...args: unknown[]) => deleteResourceMock(...args),
    deleteFolder: (...args: unknown[]) => deleteFolderMock(...args),
  };
});

vi.mock("../../src/lib/toast-service", () => ({
  toastService: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    info: vi.fn(),
    dismiss: vi.fn(),
    dismissAll: vi.fn(),
  },
}));

/**
 * Before the fix: only `res-1` at the project root.
 * After a simulated Trash restore: `folder-1` (and its child `res-2`) are
 * "restored" — i.e. present in the second `openProject` response, exactly
 * as they would be once the on-disk restore has happened and `page.tsx`
 * re-reads the project.
 */
const BEFORE_RESTORE = {
  project: {
    id: "project-internal-id",
    name: "Test Project",
    rootPath: "/projects/proj-dir-id",
    config: {},
  } as Project,
  folders: [] as Folder[],
  resources: [
    {
      id: "res-1",
      name: "My Resource",
      type: "text",
      folderId: null,
      orderIndex: 0,
    } as unknown as AnyResource,
  ],
};

const AFTER_RESTORE = {
  project: BEFORE_RESTORE.project,
  folders: [
    {
      id: "folder-1",
      name: "Restored Folder",
      type: "folder",
      parentId: null,
      orderIndex: 0,
    } as unknown as Folder,
  ],
  resources: [
    ...BEFORE_RESTORE.resources,
    {
      id: "res-2",
      name: "Restored Child Resource",
      type: "text",
      folderId: "folder-1",
      orderIndex: 0,
    } as unknown as AnyResource,
  ],
};

const openProjectMock = vi.fn();

vi.mock("../../src/lib/api/projects", () => ({
  listProjects: vi.fn().mockResolvedValue([]),
  openProject: (...args: unknown[]) => openProjectMock(...args),
}));

function MockStartPage(props: { onOpen?: (id: string) => Promise<void> }) {
  React.useEffect(() => {
    void props.onOpen?.("proj-dir-id");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

vi.mock("../../components/Start/StartPage", () => ({
  __esModule: true,
  default: (props: { onOpen?: (id: string) => Promise<void> }) => (
    <MockStartPage {...props} />
  ),
}));

type CapturedAppShellProps = {
  resources?: AnyResource[];
  folders?: Folder[];
  children?: React.ReactNode;
  onResourceAction?: (action: string, resourceId?: string) => Promise<void>;
};

vi.mock("../../components/Layout/AppShell", () => ({
  __esModule: true,
  default: (props: CapturedAppShellProps) => (
    <div>
      {props.children}
      <div data-testid="resource-names">
        {(props.resources ?? []).map((r) => (
          <div key={r.id} data-testid={`resource-${r.id}`}>
            {r.name}
          </div>
        ))}
        {(props.folders ?? []).map((f) => (
          <div key={f.id} data-testid={`folder-${f.id}`}>
            {f.name}
          </div>
        ))}
      </div>
      <button onClick={() => props.onResourceAction?.("delete", "res-1")}>
        delete-resource
      </button>
      <button onClick={() => props.onResourceAction?.("delete", "res-2")}>
        delete-restored-resource
      </button>
      <button onClick={() => props.onResourceAction?.("delete", "folder-1")}>
        delete-restored-folder
      </button>
    </div>
  ),
}));

/**
 * Stands in for `TrashView.tsx`'s post-restore
 * `notifyTrashRestored()` call — reads the real context so the test
 * exercises `page.tsx`'s actual subscription, without needing to drive the
 * full `TrashView` UI (`listTrash`/`restoreTrashItems` mocking, row
 * selection, confirm dialog) to reach it.
 */
function TrashRestoreTrigger() {
  const { notifyTrashRestored } = useTrashRefresh();
  return (
    <button onClick={() => notifyTrashRestored()}>
      simulate-trash-restore
    </button>
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("not available in test")),
  );
  deleteResourceMock.mockReset();
  deleteFolderMock.mockReset();
  openProjectMock.mockReset();
});

async function renderPageWithTrashRefresh() {
  const { default: Page } = await import("../../app/(app)/page");
  const store = makeStore();
  render(
    <Provider store={store}>
      <TrashRefreshProvider>
        <Page />
        <TrashRestoreTrigger />
      </TrashRefreshProvider>
    </Provider>,
  );
  await waitFor(() => screen.getByTestId("resource-res-1"));
  return store;
}

describe("Trash restore refresh (page.tsx + TrashRefreshContext)", () => {
  it("recognizes a restored folder as a folder in the delete-routing decision after a Trash restore notification", async () => {
    openProjectMock.mockResolvedValueOnce(BEFORE_RESTORE);
    await renderPageWithTrashRefresh();

    // Before the restore notification, the folder doesn't exist locally at
    // all — reproducing the pre-fix state where a just-restored folder was
    // invisible to `page.tsx`'s local `selectedProject`.
    expect(screen.queryByTestId("folder-folder-1")).not.toBeInTheDocument();

    openProjectMock.mockResolvedValueOnce(AFTER_RESTORE);
    fireEvent.click(screen.getByText("simulate-trash-restore"));

    // `page.tsx` re-ran `handleOpen`, which re-hydrates local state from
    // the (now updated) `openProject` response.
    await waitFor(() =>
      expect(screen.getByTestId("folder-folder-1")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByText("delete-restored-folder"));

    // The fix: `selectedProject.folders` now contains `folder-1`, so the
    // delete routes to `deleteFolder`, not `deleteResource`. Before the fix,
    // this would have silently called `deleteResource("folder-1", ...)`
    // instead (or fallen through with a stale/missing folder name).
    await waitFor(() => expect(deleteFolderMock).toHaveBeenCalled());
    expect(deleteFolderMock).toHaveBeenCalledWith("folder-1", "proj-dir-id");
    expect(deleteResourceMock).not.toHaveBeenCalledWith(
      "folder-1",
      expect.anything(),
    );
  });

  it("refreshes the local resource tree after a Trash restore notification, so a restored resource is no longer stale (visible even though its delete already routed correctly)", async () => {
    openProjectMock.mockResolvedValueOnce(BEFORE_RESTORE);
    await renderPageWithTrashRefresh();

    expect(screen.queryByTestId("resource-res-2")).not.toBeInTheDocument();

    openProjectMock.mockResolvedValueOnce(AFTER_RESTORE);
    fireEvent.click(screen.getByText("simulate-trash-restore"));

    await waitFor(() =>
      expect(screen.getByTestId("resource-res-2")).toBeInTheDocument(),
    );

    deleteResourceMock.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByText("delete-restored-resource"));

    await waitFor(() =>
      expect(deleteResourceMock).toHaveBeenCalledWith("res-2", "proj-dir-id"),
    );
  });

  it("does not re-run handleOpen on mount (only on an actual restore notification)", async () => {
    openProjectMock.mockResolvedValueOnce(BEFORE_RESTORE);
    await renderPageWithTrashRefresh();

    // One call from `handleOpen` via `StartPage`'s mocked `onOpen`; the
    // refresh effect must not have fired an extra call on its own mount
    // (`refreshToken` starts at 0 and the effect skips its first run).
    expect(openProjectMock).toHaveBeenCalledTimes(1);
  });
});
