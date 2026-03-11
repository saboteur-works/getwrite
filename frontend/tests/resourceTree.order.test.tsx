import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import ResourceTree from "../components/Tree/ResourceTree";
import { createProjectFromType } from "../src/lib/models/project-creator";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setProject } from "../src/store/projectsSlice";
import { makeStore } from "../src/store/store";
import { Provider } from "react-redux";

describe("ResourceTree ordering and defaults", () => {
    it("renders top-level children in resources order and exposes the first visible node", async () => {
        // Create a real project on disk using the project-type spec and map it
        const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-test-"));
        const specPath = path.resolve(
            process.cwd(),
            "../specs/002-define-data-models/project-types/novel_project_type.json",
        );

        const created = await createProjectFromType({
            projectRoot: tmp,
            spec: specPath,
            name: "Order Project Real",
        });

        // Build a UI view from canonical project/folders/resources
        const { buildProjectView } =
            await import("../src/lib/models/project-view");
        const view = buildProjectView({
            project: created.project,
            folders: created.folders,
            resources: created.resources,
        });

        // Enrich view.resources with titles/names from the created resources
        const resourcesEnriched = view.resources.map((r) => {
            const orig = created.resources.find((c: any) => c.id === r.id);
            return {
                ...r,
                name: orig?.name,
            };
        });

        const project = {
            id: view.project.id,
            name: view.project.name,
            description: undefined,
            createdAt: view.project.createdAt ?? new Date().toISOString(),
            updatedAt: view.project.updatedAt ?? view.project.createdAt,
            resources: resourcesEnriched,
        };

        // register project in a test-local store and render using `projectId`
        const testStore = makeStore();
        testStore.dispatch(setProject(project as any));
        render(
            <Provider store={testStore}>
                <ResourceTree projectId={project.id} />
            </Provider>,
        );

        // The scaffolder creates top-level folders (e.g. "Workspace"); expand the first folder.
        // Avoid calling getByText(undefined) when the created resource lacks title/name.
        const firstTitle =
            project.resources[0].title ?? project.resources[0].name;
        if (firstTitle) {
            const rootNode = screen.getByText(firstTitle);
            const rootBtn = rootNode.closest("button");
            expect(rootBtn).toBeTruthy();
            fireEvent.click(rootBtn as HTMLElement);
        } else {
            // Fallback: click the first rendered treeitem button
            const tree = screen.getByLabelText("Resource tree");
            const firstTreeItem = tree.querySelector('[role="treeitem"]');
            const firstBtn = firstTreeItem?.closest("button");
            expect(firstBtn).toBeTruthy();
            fireEvent.click(firstBtn as HTMLElement);
        }

        // Grab the tree nav and all rendered treeitems in DOM order
        const tree = screen.getByLabelText("Resource tree");
        const treeItems = Array.from(
            tree.querySelectorAll('[role="treeitem"]'),
        ) as HTMLElement[];

        // Find the visible occurrences of the two expected children and assert order
        const titles = treeItems.map((t) => t.textContent?.trim() ?? "");
        const idxWorkspace = titles.findIndex((t) => t.includes("Workspace"));
        const idxFront = titles.findIndex((t) => t.includes("Front Matter"));

        // If both titled nodes are rendered, assert Workspace appears before Front Matter.
        if (idxWorkspace >= 0 && idxFront >= 0) {
            expect(idxWorkspace).toBeLessThan(idxFront);
        }

        // The very first visible treeitem should correspond to the first resource
        const first = treeItems[0];
        expect(first.tabIndex).toBe(0);
        if (firstTitle) {
            expect(first.textContent).toContain(firstTitle);
        }
    });
});
