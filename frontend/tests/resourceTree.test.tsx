import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ResourceTree from "../components/Tree/ResourceTree";
import { Provider } from "react-redux";
import { setProject } from "../src/store/projectsSlice";
import { makeStore } from "../src/store/store";
import { createProject } from "../src/lib/models/project";
import { createTextResource } from "../src/lib/models/resource";
import { generateUUID } from "../src/lib/models/uuid";

describe("ResourceTree", () => {
    it("renders and expands folder nodes and calls onSelect", () => {
        const project = createProject({ name: "Test Project" });
        const now = new Date().toISOString();
        const folderId = generateUUID();
        const folder = {
            id: folderId,
            name: "Folder A",
            type: "folder",
            createdAt: now,
            metadata: {},
        };

        const item = createTextResource({
            name: "Child Item",
            folderId: folderId,
            plainText: "Child content",
        });

        const resources = [folder, item];

        const onSelect = vi.fn();
        // create isolated store for this test and register project
        const testStore = makeStore();
        testStore.dispatch(
            setProject({ id: project.id, name: project.name, resources }),
        );
        render(
            <Provider store={testStore}>
                <ResourceTree projectId={project.id} onSelect={onSelect} />
            </Provider>,
        );

        // folder title should be in the document
        const folderNode = screen.getByText("Folder A");
        expect(folderNode).toBeTruthy();

        // click the folder's button to toggle expand for this specific node
        const folderBtn = folderNode.closest("button");
        expect(folderBtn).toBeTruthy();
        fireEvent.click(folderBtn as HTMLElement);

        // after toggling expand, the child item should be visible
        const childNode = screen.getByText("Child Item");
        expect(childNode).toBeTruthy();

        fireEvent.click(childNode);
        expect(onSelect).toHaveBeenCalledWith(item.id);
    });
});
