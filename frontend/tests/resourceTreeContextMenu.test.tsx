import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ResourceTree from "../components/ResourceTree/ResourceTree";
import { Provider } from "react-redux";
import { setProject, setSelectedProjectId } from "../src/store/projectsSlice";
import { setFolders, setResources } from "../src/store/resourcesSlice";
import { makeStore } from "../src/store/store";
import type { AnyResource } from "../src/lib/models/types";
import { generateUUID } from "../src/lib/models/uuid";
import { createTextResource } from "../src/lib/models/resource";
import { createProject } from "../src/lib/models/project";

const reorderResources = vi.fn();
vi.mock("../src/lib/api/resources", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/lib/api/resources")>();
  return {
    ...actual,
    reorderResources: (...args: unknown[]) => reorderResources(...args),
  };
});
const toastError = vi.fn();
const toastInfo = vi.fn();
vi.mock("../src/lib/toast-service", () => ({
  toastService: {
    error: (...args: unknown[]) => toastError(...args),
    info: (...args: unknown[]) => toastInfo(...args),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

afterEach(() => {
  reorderResources.mockReset();
  toastError.mockReset();
  toastInfo.mockReset();
});

describe("ResourceTree context menu", () => {
  it("forwards context menu actions to onResourceAction", async () => {
    const now = new Date().toISOString();
    const project = createProject({ name: "proj_1" });

    const rootId = generateUUID();
    const root: AnyResource = {
      id: rootId,
      slug: "root",
      name: "Root",
      type: "folder",
      folderId: null,
      createdAt: now,
      updatedAt: now,
      userMetadata: {},
    } as any;

    const scene = createTextResource({
      name: "Scene A",
      folderId: rootId,
      plainText: "Hello",
    });

    const resources: AnyResource[] = [root, scene];

    const onResourceAction = vi.fn();
    const testStore = makeStore();
    testStore.dispatch(
      setProject({ id: project.id, name: project.name, resources } as any),
    );
    testStore.dispatch(setSelectedProjectId(project.id));
    testStore.dispatch(setFolders([root as any]));
    testStore.dispatch(setResources([scene as any]));

    render(
      <Provider store={testStore}>
        <ResourceTree onResourceAction={onResourceAction} />
      </Provider>,
    );

    // Expand the root so child nodes are rendered, then right-click the resource title to open the context menu
    const rootNode = screen.getByText("Root");
    // The tree row is a <div role="treeitem">, not a <button>: the expand
    // chevron and row menu are buttons rendered inside it, and role="tree"
    // allows only treeitem/group children (see ResourceTree.tsx).
    const rootBtn = rootNode.closest('[role="treeitem"]');
    expect(rootBtn).toBeTruthy();
    fireEvent.click(rootBtn as HTMLElement);

    // Right-click the resource title to open the context menu
    fireEvent.contextMenu(screen.getByText("Scene A"));

    // Menu should appear
    const menu = await screen.findByRole("menu");
    expect(menu).toBeInTheDocument();

    // Click the Copy action
    const copyBtn = screen.getByText("Copy");
    fireEvent.click(copyBtn);

    expect(onResourceAction).toHaveBeenCalledTimes(1);
    expect(onResourceAction).toHaveBeenCalledWith("copy", scene.id, "Scene A");
  });

  it("choosing a row menu item does not select that row", async () => {
    const now = new Date().toISOString();
    const project = createProject({ name: "proj_1" });
    const rootId = generateUUID();
    const root = {
      id: rootId,
      slug: "root",
      name: "Root",
      type: "folder",
      folderId: null,
      createdAt: now,
      updatedAt: now,
      userMetadata: {},
    } as unknown as AnyResource;
    const scene = createTextResource({
      name: "Scene A",
      folderId: rootId,
      plainText: "Hello",
    });
    const onResourceAction = vi.fn();
    const testStore = makeStore();
    testStore.dispatch(
      setProject({
        id: project.id,
        name: project.name,
        resources: [root, scene],
      } as never),
    );
    testStore.dispatch(setSelectedProjectId(project.id));
    testStore.dispatch(setFolders([root as never]));
    testStore.dispatch(setResources([scene as never]));

    render(
      <Provider store={testStore}>
        <ResourceTree onResourceAction={onResourceAction} />
      </Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Expand Root" }));
    fireEvent.click(
      screen.getByText("Scene A").closest('[role="treeitem"]') as HTMLElement,
    );
    expect(testStore.getState().resources.selectedResourceId).toBe(scene.id);

    fireEvent.click(screen.getByRole("button", { name: "Root options" }));
    fireEvent.click(await screen.findByText("New Smart Folder"));

    expect(onResourceAction).toHaveBeenCalledWith(
      "smart-folder",
      rootId,
      "Root",
    );
    expect(testStore.getState().resources.selectedResourceId).toBe(scene.id);
  });

  describe("File to… (Feature 106 FR-15)", () => {
    const now = new Date().toISOString();
    const folder = (id: string, name: string, orderIndex: number) =>
      ({
        id,
        slug: name,
        name,
        type: "folder",
        folderId: null,
        parentId: null,
        orderIndex,
        createdAt: now,
        updatedAt: now,
        userMetadata: {},
      }) as unknown as AnyResource;

    function setup() {
      const project = createProject({ name: "proj_1" });
      const inbox = folder(generateUUID(), "Inbox", 0);
      const other = folder(generateUUID(), "Chapters", 1);
      const note = createTextResource({
        name: "Captured note",
        folderId: inbox.id,
        plainText: "Hello",
      });
      const store = makeStore();
      store.dispatch(
        setProject({
          id: project.id,
          name: project.name,
          rootPath: "/projects/aaaaaaaa-1111-4111-8111-111111111111",
          resources: [inbox, other, note],
        } as never),
      );
      store.dispatch(setSelectedProjectId(project.id));
      store.dispatch(setFolders([inbox, other] as never));
      store.dispatch(setResources([note] as never));
      render(
        <Provider store={store}>
          <ResourceTree />
        </Provider>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Expand Inbox" }));
      return { store, inbox, other, note };
    }

    async function fileNoteTo(folderName: string) {
      fireEvent.click(await screen.findByRole("menuitem", { name: /File to/ }));
      fireEvent.click(
        await screen.findByRole("button", { name: "Destination folder" }),
      );
      fireEvent.click(await screen.findByRole("button", { name: folderName }));
      fireEvent.click(screen.getByRole("button", { name: "Move" }));
    }

    it("is offered in the context menu of any item and moves it through persistReorder", async () => {
      reorderResources.mockResolvedValue({});
      const { store, other, note } = setup();
      fireEvent.contextMenu(screen.getByText("Captured note"));
      await fileNoteTo("Chapters");

      await waitFor(() => expect(reorderResources).toHaveBeenCalledTimes(1));
      const [dir, payload] = reorderResources.mock.calls[0];
      expect(dir).toBe("aaaaaaaa-1111-4111-8111-111111111111");
      expect(payload.resourceOrder).toContainEqual({
        id: note.id,
        orderIndex: 0,
        folderId: other.id,
      });
      const moved = store
        .getState()
        .resources.resources.find((r) => r.id === note.id);
      expect(moved?.folderId).toBe(other.id);
    });

    it("is offered in the row menu and not limited to Inbox items", async () => {
      reorderResources.mockResolvedValue({});
      setup();
      fireEvent.click(screen.getByRole("button", { name: "Chapters options" }));
      expect(
        await screen.findByRole("button", { name: /File to/ }),
      ).toBeInTheDocument();
    });

    it("files from the row menu through the same move", async () => {
      reorderResources.mockResolvedValue({});
      const { other, note } = setup();
      fireEvent.click(
        screen.getByRole("button", { name: "Captured note options" }),
      );
      fireEvent.click(await screen.findByRole("button", { name: /File to/ }));
      fireEvent.click(
        await screen.findByRole("button", { name: "Destination folder" }),
      );
      fireEvent.click(await screen.findByRole("button", { name: "Chapters" }));
      fireEvent.click(screen.getByRole("button", { name: "Move" }));
      await waitFor(() => expect(reorderResources).toHaveBeenCalledTimes(1));
      expect(reorderResources.mock.calls[0][1].resourceOrder).toContainEqual({
        id: note.id,
        orderIndex: 0,
        folderId: other.id,
      });
    });

    it("shows a message and leaves the item where it was when the move fails", async () => {
      reorderResources.mockRejectedValue(new Error("500"));
      const { store, inbox, note } = setup();
      fireEvent.contextMenu(screen.getByText("Captured note"));
      await fileNoteTo("Chapters");

      await waitFor(() => expect(toastError).toHaveBeenCalled());
      const stored = store
        .getState()
        .resources.resources.find((r) => r.id === note.id);
      expect(stored?.folderId).toBe(inbox.id);
    });

    it("does not move to the item's own folder (computeMovePayload refuses)", async () => {
      const { note } = setup();
      void note;
      fireEvent.contextMenu(screen.getByText("Captured note"));
      fireEvent.click(await screen.findByRole("menuitem", { name: /File to/ }));
      // Destination defaults to the current folder, so Move is disabled.
      expect(screen.getByRole("button", { name: "Move" })).toBeDisabled();
      expect(reorderResources).not.toHaveBeenCalled();
    });
  });
});
