import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { makeStore } from "../../src/store/store";
import TrashRefreshProvider from "../../components/Layout/TrashRefreshContext";
import type { Project, Folder, AnyResource } from "../../src/lib/models/types";

/**
 * Regression coverage for Task 5 (FR-5): `page.tsx`'s `"delete"` branch must
 * not mutate local/Redux state on a rejected `deleteResource`/`deleteFolder`
 * call, and must surface the failure via `toastService.error`.
 *
 * `page.tsx`'s `handleResourceAction` is not exported directly, so this test
 * reaches it the way the task description allows: `AppShell` is replaced
 * with a minimal test double that captures the `onResourceAction` prop
 * `page.tsx` wires to it and exposes buttons that invoke it directly with
 * `"delete"` for a resource id and a folder id — the same call
 * `ShellModalCoordinator`'s confirmed-delete flow makes in the real app,
 * without reimplementing that confirmation-dialog wiring here.
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

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock("../../src/lib/toast-service", () => ({
  toastService: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
    loading: vi.fn(),
    info: vi.fn(),
    dismiss: vi.fn(),
    dismissAll: vi.fn(),
  },
}));

vi.mock("../../src/lib/api/projects", () => ({
  listProjects: vi.fn().mockResolvedValue([]),
  openProject: vi
    .fn()
    .mockResolvedValue({
      project: {
        id: "project-internal-id",
        name: "Test Project",
        rootPath: "/projects/proj-dir-id",
        config: {},
      } as Project,
      folders: [
        {
          id: "folder-1",
          name: "My Folder",
          type: "folder",
          parentId: null,
          orderIndex: 0,
        } as unknown as Folder,
      ],
      resources: [
        {
          id: "res-1",
          name: "My Resource",
          type: "text",
          folderId: null,
          orderIndex: 0,
        } as unknown as AnyResource,
        {
          id: "res-2",
          name: "Child Resource",
          type: "text",
          folderId: "folder-1",
          orderIndex: 0,
        } as unknown as AnyResource,
      ],
    }),
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
  default: (props: CapturedAppShellProps) => {
    return (
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
        <button onClick={() => props.onResourceAction?.("delete", "folder-1")}>
          delete-folder
        </button>
      </div>
    );
  },
}));

// `checkWorkspaceLock` fires a real fetch to `/api/encryption` on mount;
// stub it out so it fails harmlessly (rejected async thunk) rather than
// hitting a real network call in the test environment.
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("not available in test")),
  );
  deleteResourceMock.mockReset();
  deleteFolderMock.mockReset();
  toastSuccessMock.mockReset();
  toastErrorMock.mockReset();
});

async function renderPageWithOpenProject() {
  const { default: Page } = await import("../../app/(app)/page");
  const store = makeStore();
  render(
    <Provider store={store}>
      <TrashRefreshProvider>
        <Page />
      </TrashRefreshProvider>
    </Provider>,
  );
  await waitFor(() => screen.getByTestId("resource-res-1"));
  return store;
}

describe("page.tsx delete branch (Task 5, FR-5)", () => {
  it("keeps the resource in state and shows an error toast when deleteResource rejects", async () => {
    deleteResourceMock.mockRejectedValueOnce(new Error("500"));
    await renderPageWithOpenProject();

    fireEvent.click(screen.getByText("delete-resource"));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(screen.getByTestId("resource-res-1")).toBeInTheDocument();
    expect(toastSuccessMock).not.toHaveBeenCalledWith(
      "Resource deleted",
      expect.anything(),
    );
  });

  it("keeps the folder and its descendant in state and shows an error toast when deleteFolder rejects", async () => {
    deleteFolderMock.mockRejectedValueOnce(new Error("500"));
    await renderPageWithOpenProject();

    fireEvent.click(screen.getByText("delete-folder"));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(screen.getByTestId("folder-folder-1")).toBeInTheDocument();
    expect(screen.getByTestId("resource-res-2")).toBeInTheDocument();
    expect(toastSuccessMock).not.toHaveBeenCalledWith(
      "Folder deleted",
      expect.anything(),
    );
  });

  it("removes the resource from state and shows a success toast when deleteResource succeeds", async () => {
    deleteResourceMock.mockResolvedValueOnce(undefined);
    await renderPageWithOpenProject();

    fireEvent.click(screen.getByText("delete-resource"));

    await waitFor(() =>
      expect(screen.queryByTestId("resource-res-1")).not.toBeInTheDocument(),
    );
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "Resource deleted",
      "My Resource",
    );
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("removes the folder and its descendant from state and shows a success toast when deleteFolder succeeds", async () => {
    deleteFolderMock.mockResolvedValueOnce(undefined);
    await renderPageWithOpenProject();

    fireEvent.click(screen.getByText("delete-folder"));

    await waitFor(() =>
      expect(screen.queryByTestId("folder-folder-1")).not.toBeInTheDocument(),
    );
    expect(screen.queryByTestId("resource-res-2")).not.toBeInTheDocument();
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "Folder deleted",
      "My Folder",
    );
    expect(toastErrorMock).not.toHaveBeenCalled();
  });
});
