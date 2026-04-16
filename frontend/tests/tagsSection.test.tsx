import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import TagsSection from "../components/Sidebar/TagsSection";
import { makeStore } from "../src/store/store";
import { setProject, setSelectedProjectId } from "../src/store/projectsSlice";
import {
    setResources,
    setSelectedResourceId,
} from "../src/store/resourcesSlice";
import { createTextResource } from "../src/lib/models/resource";

const PROJECT_PATH = "/tmp/test-project";
const PROJECT_ID = "proj-test-1";

function makeFetchStub(options: {
    tags?: { id: string; name: string; color?: string }[];
    tagIds?: string[];
}) {
    return vi.spyOn(globalThis, "fetch").mockImplementation(
        async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = input.toString();
            const body = init?.body ? JSON.parse(init.body as string) : {};

            if (url.includes("/api/project/tags") && !url.includes("/assign")) {
                if (body.action === "list") {
                    return {
                        ok: true,
                        json: async () => ({ tags: options.tags ?? [] }),
                    } as Response;
                }
                if (body.action === "assignments") {
                    return {
                        ok: true,
                        json: async () => ({ tagIds: options.tagIds ?? [] }),
                    } as Response;
                }
            }

            if (url.includes("/api/project/tags/assign")) {
                return {
                    ok: true,
                    json: async () => ({}),
                } as Response;
            }

            return { ok: true, json: async () => ({}) } as Response;
        },
    );
}

function setupStore(resourceId: string) {
    const store = makeStore();
    store.dispatch(
        setProject({
            id: PROJECT_ID,
            name: "Test Project",
            rootPath: PROJECT_PATH,
        }),
    );
    store.dispatch(setSelectedProjectId(PROJECT_ID));
    const res = createTextResource({ name: "My Scene" });
    (res as any).id = resourceId;
    store.dispatch(setResources([res]));
    store.dispatch(setSelectedResourceId(resourceId));
    return store;
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("TagsSection", () => {
    it("renders tag chips from the project tag list", async () => {
        const tags = [
            { id: "tag-1", name: "Draft" },
            { id: "tag-2", name: "Review" },
        ];
        makeFetchStub({ tags, tagIds: [] });
        const store = setupStore("res-abc");

        render(
            <Provider store={store}>
                <TagsSection />
            </Provider>,
        );

        expect(await screen.findByText("Draft")).toBeInTheDocument();
        expect(await screen.findByText("Review")).toBeInTheDocument();
    });

    it("marks assigned tags as active (aria-pressed=true)", async () => {
        const tags = [
            { id: "tag-1", name: "Draft" },
            { id: "tag-2", name: "Review" },
        ];
        makeFetchStub({ tags, tagIds: ["tag-1"] });
        const store = setupStore("res-abc");

        render(
            <Provider store={store}>
                <TagsSection />
            </Provider>,
        );

        const draftBtn = await screen.findByRole("button", { name: "Draft" });
        const reviewBtn = await screen.findByRole("button", { name: "Review" });

        await waitFor(() => {
            expect(draftBtn).toHaveAttribute("aria-pressed", "true");
            expect(reviewBtn).toHaveAttribute("aria-pressed", "false");
        });
    });

    it("clicking an inactive chip calls the assign endpoint and activates it", async () => {
        const tags = [{ id: "tag-1", name: "Draft" }];
        const fetchStub = makeFetchStub({ tags, tagIds: [] });
        const store = setupStore("res-def");

        render(
            <Provider store={store}>
                <TagsSection />
            </Provider>,
        );

        const btn = await screen.findByRole("button", { name: "Draft" });
        expect(btn).toHaveAttribute("aria-pressed", "false");

        fireEvent.click(btn);

        await waitFor(() => {
            expect(btn).toHaveAttribute("aria-pressed", "true");
        });

        const assignCall = fetchStub.mock.calls.find(([url]) =>
            url.toString().includes("/api/project/tags/assign"),
        );
        expect(assignCall).toBeDefined();
        const body = JSON.parse(assignCall![1]?.body as string);
        expect(body.assign).toBe(true);
        expect(body.tagId).toBe("tag-1");
    });

    it("clicking an active chip calls the unassign endpoint and deactivates it", async () => {
        const tags = [{ id: "tag-1", name: "Draft" }];
        const fetchStub = makeFetchStub({ tags, tagIds: ["tag-1"] });
        const store = setupStore("res-def");

        render(
            <Provider store={store}>
                <TagsSection />
            </Provider>,
        );

        const btn = await screen.findByRole("button", { name: "Draft" });
        await waitFor(() => {
            expect(btn).toHaveAttribute("aria-pressed", "true");
        });

        fireEvent.click(btn);

        await waitFor(() => {
            expect(btn).toHaveAttribute("aria-pressed", "false");
        });

        const assignCall = fetchStub.mock.calls.find(([url]) =>
            url.toString().includes("/api/project/tags/assign"),
        );
        expect(assignCall).toBeDefined();
        const body = JSON.parse(assignCall![1]?.body as string);
        expect(body.assign).toBe(false);
    });

    it("shows the empty-state hint when the tag list is empty", async () => {
        makeFetchStub({ tags: [], tagIds: [] });
        const store = setupStore("res-empty");

        render(
            <Provider store={store}>
                <TagsSection />
            </Provider>,
        );

        expect(
            await screen.findByText(/No tags yet/i),
        ).toBeInTheDocument();
    });
});
