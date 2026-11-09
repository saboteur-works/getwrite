import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { runAxe } from "./a11y/helpers/axe";
import ResourceTree from "../components/ResourceTree/ResourceTree";
import { Provider } from "react-redux";
import { setProject, setSelectedProjectId } from "../src/store/projectsSlice";
import { makeStore } from "../src/store/store";
import { createProject } from "../src/lib/models/project";
import {
  createFolderResource,
  createTextResource,
} from "../src/lib/models/resource";
import { setFolders, setResources } from "../src/store/resourcesSlice";

describe("ResourceTree", () => {
  it("renders folders, expands nodes, and syncs selected resource", async () => {
    const project = createProject({ name: "Test Project" });
    const folder = createFolderResource({
      name: "Folder A",
      parentFolderId: null,
      orderIndex: 0,
      metadataSource: { isMetadataSource: false },
    });
    const folderId = folder.id;

    const item = createTextResource({
      name: "Child Item",
      folderId: folderId,
      plainText: "Child content",
    });
    item.orderIndex = 0;

    const testStore = makeStore();
    testStore.dispatch(
      setProject({
        id: project.id,
        name: project.name,
        rootPath: project.rootPath ?? "",
        folders: [folder],
        resources: [item],
      }),
    );
    testStore.dispatch(setSelectedProjectId(project.id));
    testStore.dispatch(setFolders([folder]));
    testStore.dispatch(setResources([item]));

    render(
      <Provider store={testStore}>
        <ResourceTree />
      </Provider>,
    );

    const folderNode = screen.getByText("Folder A");
    expect(folderNode).toBeTruthy();

    // The tree row is a <div role="treeitem">, not a <button>: the expand
    // chevron and row menu are buttons rendered inside it, and role="tree"
    // allows only treeitem/group children (see ResourceTree.tsx).
    const folderBtn = folderNode.closest('[role="treeitem"]');
    expect(folderBtn).toBeTruthy();
    fireEvent.click(folderBtn as HTMLElement);

    const childNode = await screen.findByText("Child Item");
    expect(childNode).toBeTruthy();

    fireEvent.click(childNode);
    expect(testStore.getState().resources.selectedResourceId).toBe(item.id);
  });

  it("names a folder's expand chevron after the folder", async () => {
    // The chevron's only content is an aria-hidden icon, so before this it was
    // announced as an unlabelled button — and there is one per folder row.
    const folder = createFolderResource({
      name: "Act One",
      parentFolderId: null,
      orderIndex: 0,
      metadataSource: { isMetadataSource: false },
    });
    const project = createProject({ name: "Chevron Project" });

    const testStore = makeStore();
    testStore.dispatch(
      setProject({
        id: project.id,
        name: project.name,
        rootPath: project.rootPath ?? "",
        folders: [folder],
        resources: [],
      }),
    );
    testStore.dispatch(setSelectedProjectId(project.id));
    testStore.dispatch(setFolders([folder]));
    testStore.dispatch(setResources([]));

    render(
      <Provider store={testStore}>
        <ResourceTree />
      </Provider>,
    );

    const chevron = screen.getByRole("button", { name: "Expand Act One" });
    fireEvent.click(chevron);
    expect(
      await screen.findByRole("button", { name: "Collapse Act One" }),
    ).toBeTruthy();
  });
});

describe("ResourceTree Inbox count (Feature 106 FR-14)", () => {
  function setup(opts: {
    inboxName?: string;
    withConfig?: boolean;
    decoyName?: string;
    items?: "none" | "some";
  }) {
    const project = createProject({ name: "Inbox Project" });
    const mkFolder = (name: string, parent: string | null, order: number) =>
      createFolderResource({
        name,
        parentFolderId: parent,
        orderIndex: order,
        metadataSource: { isMetadataSource: false },
      });
    const inbox = mkFolder(opts.inboxName ?? "Inbox", null, 0);
    const sub = mkFolder("Sub", inbox.id, 0);
    const decoy = mkFolder(opts.decoyName ?? "Elsewhere", null, 1);
    const mk = (name: string, folderId: string) => {
      const r = createTextResource({ name, folderId, plainText: "x" });
      r.orderIndex = 0;
      return r;
    };
    const resources =
      opts.items === "none"
        ? []
        : [mk("One", inbox.id), mk("Two", sub.id), mk("Three", decoy.id)];
    const store = makeStore();
    store.dispatch(
      setProject({
        id: project.id,
        name: project.name,
        rootPath: project.rootPath ?? "",
        folders: [inbox, sub, decoy],
        resources: [],
        ...(opts.withConfig === false ? {} : { inboxFolderId: inbox.id }),
      }),
    );
    store.dispatch(setSelectedProjectId(project.id));
    store.dispatch(setFolders([inbox, sub, decoy]));
    store.dispatch(setResources(resources));
    return { store, inbox, sub, decoy, mk };
  }

  const renderTree = (store: ReturnType<typeof makeStore>) =>
    render(
      <Provider store={store}>
        <ResourceTree />
      </Provider>,
    );

  it("counts resources in the Inbox and its descendant folders, not folders", () => {
    const { store } = setup({});
    renderTree(store);
    expect(
      screen.getByRole("treeitem", { name: "Inbox, 2 items" }),
    ).toBeTruthy();
    expect(screen.getByTestId("inbox-count").textContent).toBe("2");
  });

  it("uses the singular for one item", () => {
    const { store, inbox, mk } = setup({ items: "none" });
    act(() => {
      store.dispatch(setResources([mk("Only", inbox.id)]));
    });
    renderTree(store);
    expect(
      screen.getByRole("treeitem", { name: "Inbox, 1 item" }),
    ).toBeTruthy();
  });

  it("shows no badge when the Inbox is empty", () => {
    const { store } = setup({ items: "none" });
    renderTree(store);
    expect(screen.queryByTestId("inbox-count")).toBeNull();
    expect(screen.getByRole("treeitem", { name: "Inbox" })).toBeTruthy();
  });

  it("shows no badge when the project has no inboxFolderId", () => {
    const { store } = setup({ withConfig: false });
    renderTree(store);
    expect(screen.queryByTestId("inbox-count")).toBeNull();
  });

  it("does not badge a folder merely named Inbox", () => {
    const { store } = setup({ inboxName: "Real", decoyName: "Inbox" });
    renderTree(store);
    expect(
      screen.getByRole("treeitem", { name: "Real, 2 items" }),
    ).toBeTruthy();
    expect(screen.getByRole("treeitem", { name: "Inbox" })).toBeTruthy();
    expect(screen.getAllByTestId("inbox-count")).toHaveLength(1);
  });

  it("updates on capture, move out and removal with no request", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { store, inbox, decoy, mk } = setup({});
    renderTree(store);
    const added = mk("Captured", inbox.id);
    act(() => {
      store.dispatch(
        setResources([...store.getState().resources.resources, added]),
      );
    });
    expect(screen.getByTestId("inbox-count").textContent).toBe("3");
    act(() => {
      store.dispatch(
        setResources(
          store
            .getState()
            .resources.resources.map((r) =>
              r.id === added.id ? { ...r, folderId: decoy.id } : r,
            ),
        ),
      );
    });
    expect(screen.getByTestId("inbox-count").textContent).toBe("2");
    act(() => {
      store.dispatch(setResources([]));
    });
    expect(screen.queryByTestId("inbox-count")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("does not move focus or announce when the count appears", () => {
    const { store, inbox, mk } = setup({ items: "none" });
    renderTree(store);
    const before = document.activeElement;
    act(() => {
      store.dispatch(setResources([mk("New", inbox.id)]));
    });
    expect(document.activeElement).toBe(before);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("passes axe with a count shown", async () => {
    const { store } = setup({});
    const { container } = renderTree(store);
    await runAxe(container);
  });
});
