import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import ResourceTree from "../components/Tree/ResourceTree";
import { Provider } from "react-redux";
import { setProject } from "../src/store/projectsSlice";
import { makeStore } from "../src/store/store";
import { createProject } from "../src/lib/models/project";
import { createTextResource } from "../src/lib/models/resource";
import { generateUUID } from "../src/lib/models/uuid";

describe("ResourceTree drag UI", () => {
    it("shows drag handle when reorderable is enabled", () => {
        const project = createProject({ name: "Drag Project" });
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

        const testStore = makeStore();
        testStore.dispatch(
            setProject({
                id: project.id,
                name: project.name,
                rootPath: project.rootPath ?? "",
                resources,
            }),
        );

        render(
            <Provider store={testStore}>
                <ResourceTree
                    projectId={project.id}
                    reorderable
                    onReorder={() => {}}
                />
            </Provider>,
        );

        const handle = screen.getAllByTestId("drag-handle");
        expect(handle.length).toBeGreaterThan(0);
    });
});
