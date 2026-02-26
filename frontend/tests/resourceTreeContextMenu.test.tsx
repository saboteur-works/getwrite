import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ResourceTree from "../components/Tree/ResourceTree";
import { Provider } from "react-redux";
import { setProject } from "../src/store/projectsSlice";
import { makeStore } from "../src/store/store";
import type { AnyResource } from "../src/lib/models/types";
import { generateUUID } from "../src/lib/models/uuid";
import { createTextResource } from "../src/lib/models/resource";
import { createProject } from "../src/lib/models/project";

describe("ResourceTree context menu", () => {
    it("forwards context menu actions to onResourceAction", async () => {
        const now = new Date().toISOString();
        const project = createProject({ name: "proj_1" });

        const rootId = generateUUID();
        const root: AnyResource = {
            id: rootId,
            name: "Root",
            title: "Root",
            type: "folder",
            createdAt: now,
            updatedAt: now,
            metadata: {},
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
            setProject({
                id: project.id,
                name: project.name,
                resources,
            } as any),
        );

        render(
            <Provider store={testStore}>
                <ResourceTree
                    projectId={project.id}
                    onResourceAction={onResourceAction}
                />
            </Provider>,
        );

        // Expand the root so child nodes are rendered, then right-click the resource title to open the context menu
        const rootNode = screen.getByText("Root");
        const rootBtn = rootNode.closest("button");
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
        expect(onResourceAction).toHaveBeenCalledWith("copy", scene.id);
    });
});
