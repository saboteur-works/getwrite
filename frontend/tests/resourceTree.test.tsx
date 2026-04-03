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

        const folderBtn = folderNode.closest("button");
        expect(folderBtn).toBeTruthy();
        fireEvent.click(folderBtn as HTMLElement);

        const childNode = await screen.findByText("Child Item");
        expect(childNode).toBeTruthy();

        fireEvent.click(childNode);
        expect(testStore.getState().resources.selectedResourceId).toBe(item.id);
    });
});
