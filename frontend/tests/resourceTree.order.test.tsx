import React from "react";
import { render, screen } from "@testing-library/react";
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

        const project = {
            id: created.project.id,
            name: created.project.name,
            rootPath: created.project.rootPath ?? "",
            folders: created.folders,
            resources: created.resources,
        };

        // register project in a test-local store and render using `projectId`
        const testStore = makeStore();
        testStore.dispatch(setProject(project as any));
        render(
            <Provider store={testStore}>
                <ResourceTree projectId={project.id} />
            </Provider>,
        );

        // Grab the tree nav and all rendered treeitems in DOM order
        const tree = screen.getByLabelText("Resource tree");
        const treeItems = Array.from(
            tree.querySelectorAll('[role="treeitem"]'),
        ) as HTMLElement[];
        expect(treeItems.length).toBeGreaterThan(0);

        // Find the visible occurrences of the expected top-level folders and assert order.
        const titles = treeItems.map((t) => t.textContent?.trim() ?? "");
        const idxWorkspace = titles.findIndex((t) => t.includes("Workspace"));
        const idxFront = titles.findIndex((t) => t.includes("Front Matter"));

        expect(idxWorkspace).toBeGreaterThanOrEqual(0);
        expect(idxFront).toBeGreaterThanOrEqual(0);
        expect(idxWorkspace).toBeLessThan(idxFront);

        // The very first visible treeitem should correspond to the first folder.
        const first = treeItems[0];
        expect(first.tabIndex).toBe(0);
        expect(first.textContent).toContain("Workspace");
    });
});
