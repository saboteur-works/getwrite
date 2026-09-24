import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
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
