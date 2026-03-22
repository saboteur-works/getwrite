import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import ResourceTree from "../components/ResourceTree/ResourceTree";
import { Provider } from "react-redux";
import { setProject, setSelectedProjectId } from "../src/store/projectsSlice";
import { makeStore } from "../src/store/store";
import { createProject } from "../src/lib/models/project";
import { createTextResource } from "../src/lib/models/resource";
import { setResources } from "../src/store/resourcesSlice";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("ResourceTree drag reorder", () => {
    it("sends reorder payload using id/orderIndex entries only", async () => {
        const project = createProject({ name: "Drag Project" });
        const first = createTextResource({
            name: "First",
            plainText: "one",
            orderIndex: 0,
        });
        const second = createTextResource({
            name: "Second",
            plainText: "two",
            orderIndex: 1,
        });

        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue({ ok: true, status: 200 } as Response);

        const testStore = makeStore();
        testStore.dispatch(
            setProject({
                id: project.id,
                name: project.name,
                rootPath: project.rootPath ?? "/tmp/project",
                resources: [first, second],
            }),
        );
        testStore.dispatch(setSelectedProjectId(project.id));
        testStore.dispatch(setResources([first, second]));

        render(
            <Provider store={testStore}>
                <ResourceTree />
            </Provider>,
        );

        const tree = screen.getByRole("tree", { name: "Resource tree" });
        const treeItems = Array.from(
            tree.querySelectorAll('[role="treeitem"]'),
        ) as HTMLElement[];
        expect(treeItems.length).toBeGreaterThanOrEqual(2);

        const source = treeItems[0];
        const target = treeItems[1];

        const dataTransfer = {
            data: {} as Record<string, string>,
            setData(key: string, value: string) {
                this.data[key] = value;
            },
            getData(key: string) {
                return this.data[key];
            },
            setDragImage() {
                return undefined;
            },
        };

        await act(async () => {
            fireEvent.dragStart(source, { dataTransfer });
            fireEvent.dragOver(target, { dataTransfer });
            fireEvent.drop(target, { dataTransfer });
            await Promise.resolve();
        });

        expect(fetchMock).toHaveBeenCalled();

        const lastCall = fetchMock.mock.calls.at(-1);
        expect(lastCall).toBeDefined();
        const requestBody = JSON.parse(
            (lastCall?.[1] as { body?: string })?.body ?? "{}",
        );

        expect(Array.isArray(requestBody.folderOrder)).toBe(true);
        expect(Array.isArray(requestBody.resourceOrder)).toBe(true);

        for (const item of requestBody.resourceOrder) {
            expect(typeof item.id).toBe("string");
            expect(typeof item.orderIndex).toBe("number");
            expect(item).not.toHaveProperty("name");
            expect(item).not.toHaveProperty("path");
        }
    });
});
